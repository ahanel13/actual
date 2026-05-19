import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import { AutoSizer } from 'react-virtualized-auto-sizer';

import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { integerToCurrency } from '@actual-app/core/shared/util';
import { eachMonthOfInterval, format, subMonths } from 'date-fns';
import { Area, AreaChart, Tooltip as RechartsTooltip, YAxis } from 'recharts';

import { PrivacyFilter } from '#components/PrivacyFilter';
import { useRechartsAnimation } from '#components/reports/chart-theme';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useBalanceHistory } from '#hooks/useBalanceHistory';
import { useLocale } from '#hooks/useLocale';
import * as query from '#queries';
import { liveQuery } from '#queries/liveQuery';

const LABEL_WIDTH = 70;
const LABEL_HEIGHT_ABOVE = 36;

type BalanceHistoryGraphProps = {
  accountId?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  compact?: boolean;
  labelsAbove?: boolean;
};

export function BalanceHistoryGraph({
  accountId,
  style,
  ref,
  compact = false,
  labelsAbove = false,
}: BalanceHistoryGraphProps) {
  const locale = useLocale();
  const animationProps = useRechartsAnimation({ isAnimationActive: false });
  const [balanceData, setBalanceData] = useState<
    Array<{ date: string; balance: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Snapshot-based path: use balance_history when available
  const { data: snapshots = [] } = useBalanceHistory(accountId ?? undefined);
  const hasSnapshots = accountId != null && snapshots.length > 0;
  const [hoveredValue, setHoveredValue] = useState<{
    date: string;
    balance: number;
  } | null>(null);
  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  const [monthlyTotals, setMonthlyTotals] = useState<Array<{
    date: string;
    balance: number;
  }> | null>(null);

  const percentageChange = useMemo(() => {
    if (balanceData.length < 2) return 0;
    const firstBalance = balanceData[0].balance;
    const lastBalance = balanceData[balanceData.length - 1].balance;
    if (firstBalance === 0) return 0;
    return ((lastBalance - firstBalance) / Math.abs(firstBalance)) * 100;
  }, [balanceData]);
  const color = useMemo(
    () => (percentageChange >= 0 ? theme.noticeTextLight : theme.errorText),
    [percentageChange],
  );

  // Snapshot-based processing: group by month, take last snapshot per month
  useEffect(() => {
    if (!hasSnapshots) return;

    const monthMap = new Map<string, number>();
    for (const s of snapshots) {
      const month = s.date.slice(0, 7); // YYYY-MM
      monthMap.set(month, s.balance);
    }

    const balances = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, balance]) => ({
        date: monthUtils.format(month, 'MMM yyyy', locale),
        balance,
      }));

    setBalanceData(balances);
    setHoveredValue(balances[balances.length - 1] ?? null);
    setLoading(false);
  }, [hasSnapshots, snapshots, locale]);

  useEffect(() => {
    if (hasSnapshots) return; // snapshot path handles rendering

    // Reset state when accountId changes
    setStartingBalance(null);
    setMonthlyTotals(null);
    setLoading(true);

    const endDate = new Date();
    const startDate = subMonths(endDate, 12);

    const startingBalanceQuery = query
      .transactions(accountId)
      .filter({
        date: { $lt: monthUtils.firstDayOfMonth(startDate) },
      })
      .calculate({ $sum: '$amount' });
    const monthlyTotalsQuery = query
      .transactions(accountId)
      .filter({
        $and: [
          { date: { $gte: monthUtils.firstDayOfMonth(startDate) } },
          { date: { $lte: monthUtils.lastDayOfMonth(endDate) } },
        ],
      })
      .groupBy({ $month: '$date' })
      .select([{ date: { $month: '$date' } }, { amount: { $sum: '$amount' } }]);

    const startingBalanceLive: ReturnType<typeof liveQuery<number>> = liveQuery(
      startingBalanceQuery,
      {
        onData: (data: number[]) => {
          setStartingBalance(data[0] || 0);
        },
        onError: error => {
          console.error('Error fetching starting balance:', error);
          setLoading(false);
        },
      },
    );

    const monthlyTotalsLive: ReturnType<
      typeof liveQuery<{ date: string; amount: number }>
    > = liveQuery(monthlyTotalsQuery, {
      onData: (data: Array<{ date: string; amount: number }>) => {
        setMonthlyTotals(
          data.map(d => ({
            date: d.date,
            balance: d.amount,
          })),
        );
      },
      onError: error => {
        console.error('Error fetching monthly totals:', error);
        setLoading(false);
      },
    });

    return () => {
      startingBalanceLive?.unsubscribe();
      monthlyTotalsLive?.unsubscribe();
    };
  }, [accountId, locale, hasSnapshots]);

  // Process data when both startingBalance and monthlyTotals are available (transaction path)
  useEffect(() => {
    if (hasSnapshots) return;
    if (startingBalance !== null && monthlyTotals !== null) {
      const endDate = new Date();
      const startDate = subMonths(endDate, 12);
      const months = eachMonthOfInterval({
        start: startDate,
        end: endDate,
      }).map(m => format(m, 'yyyy-MM'));

      function processData(
        startingBalanceValue: number,
        monthlyTotalsValue: Array<{ date: string; balance: number }>,
      ) {
        let currentBalance = startingBalanceValue;
        const totals = [...monthlyTotalsValue];
        totals.reverse().forEach(month => {
          currentBalance = currentBalance + month.balance;
          month.balance = currentBalance;
        });

        // if the account doesn't have recent transactions
        // then the empty months will be missing from our data
        // so add in entries for those here
        if (totals.length === 0) {
          //handle case of no transactions in the last year
          months.forEach(expectedMonth =>
            totals.push({
              date: expectedMonth,
              balance: startingBalanceValue,
            }),
          );
        } else if (totals.length < months.length) {
          // iterate through each array together and add in missing data
          let totalsIndex = 0;
          let mostRecent = startingBalanceValue;
          months.forEach(expectedMonth => {
            if (totalsIndex > totals.length - 1) {
              // fill in the data at the end of the window
              totals.push({
                date: expectedMonth,
                balance: mostRecent,
              });
            } else if (totals[totalsIndex].date === expectedMonth) {
              // a matched month
              mostRecent = totals[totalsIndex].balance;
              totalsIndex += 1;
            } else {
              // a missing month in the middle
              totals.push({
                date: expectedMonth,
                balance: mostRecent,
              });
            }
          });
        }

        const balances = totals
          .sort((a, b) => monthUtils.differenceInCalendarMonths(a.date, b.date))
          .map(t => {
            return {
              balance: t.balance,
              date: monthUtils.format(t.date, 'MMM yyyy', locale),
            };
          });

        setBalanceData(balances);
        setHoveredValue(balances[balances.length - 1]);
        setLoading(false);
      }

      processData(startingBalance, monthlyTotals);
    }
  }, [startingBalance, monthlyTotals, locale]);

  // State to track if the chart is hovered (used to conditionally render PrivacyFilter)
  const [isHovered, setIsHovered] = useState(false);

  return (
    <View ref={ref} style={{ margin: 10, flexShrink: 0, ...style }}>
      <AutoSizer
        renderProp={({ width = 0, height = 0 }) => {
          if (width === 0 || height === 0) {
            return null;
          }

          if (loading) {
            return (
              <div style={{ width, height }}>
                <LoadingIndicator />
              </div>
            );
          }

          const showSideLabels = !compact && !labelsAbove;
          const showTopLabels = !compact && labelsAbove;
          const chartWidth = showSideLabels ? width - LABEL_WIDTH : width;
          const chartHeight = showTopLabels
            ? height - LABEL_HEIGHT_ABOVE
            : height;

          const hoveredIndex = hoveredValue
            ? balanceData.findIndex(d => d.date === hoveredValue.date)
            : -1;
          const previousValue =
            hoveredIndex > 0 ? balanceData[hoveredIndex - 1] : null;
          const monthlyChange =
            previousValue && hoveredValue
              ? hoveredValue.balance - previousValue.balance
              : null;

          const topLabelRow = showTopLabels && (
            <View
              style={{
                height: LABEL_HEIGHT_ABOVE,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                ...styles.smallText,
              }}
            >
              {percentageChange !== 0 ? (
                <Text style={{ color, fontWeight: 600 }}>
                  {percentageChange >= 0 ? '+' : ''}
                  {percentageChange.toFixed(1)}%
                </Text>
              ) : (
                <View />
              )}
              {hoveredValue && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: 8,
                    flexShrink: 1,
                    minWidth: 0,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: 700,
                      color: theme.pageText,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hoveredValue.date}
                  </Text>
                  <PrivacyFilter activationFilters={[() => !isHovered]}>
                    <Text
                      style={{ color: theme.pageText, whiteSpace: 'nowrap' }}
                    >
                      {integerToCurrency(hoveredValue.balance)}
                    </Text>
                  </PrivacyFilter>
                  {monthlyChange !== null && (
                    <Text
                      style={{
                        color:
                          monthlyChange >= 0
                            ? theme.noticeTextLight
                            : theme.errorText,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {monthlyChange >= 0 ? '+' : ''}
                      {integerToCurrency(monthlyChange)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );

          return (
            <View style={{ width }}>
              {topLabelRow}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <AreaChart
                  data={balanceData}
                  width={chartWidth}
                  height={chartHeight}
                >
                  <defs>
                    <linearGradient
                      id="fillLight"
                      x1="0.9"
                      y1="0"
                      x2="0.3"
                      y2="1"
                    >
                      <stop stopColor={theme.noticeTextLight} stopOpacity={1} />
                      <stop
                        offset="90%"
                        stopColor={theme.noticeTextLight}
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                    <linearGradient
                      id="fillError"
                      x1="0.9"
                      y1="0"
                      x2="0.3"
                      y2="1"
                    >
                      <stop stopColor={theme.errorText} stopOpacity={1} />
                      <stop
                        offset="90%"
                        stopColor={theme.errorText}
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <RechartsTooltip
                    contentStyle={{
                      display: 'none',
                    }}
                    labelFormatter={(label, items) => {
                      const data = items[0]?.payload;
                      if (data) {
                        setHoveredValue(data);
                      }
                      return '';
                    }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={color}
                    strokeWidth={2}
                    {...animationProps}
                    fill={
                      color === theme.noticeTextLight
                        ? 'url(#fillLight)'
                        : 'url(#fillError)'
                    }
                  />
                </AreaChart>

                {showSideLabels && (
                  <SpaceBetween
                    direction="vertical"
                    style={{
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      width: LABEL_WIDTH,
                      textAlign: 'right',
                      ...styles.verySmallText,
                    }}
                  >
                    {percentageChange === 0 ? (
                      <div />
                    ) : (
                      <Text style={{ color }}>
                        {percentageChange >= 0 ? '+' : ''}
                        {percentageChange.toFixed(1)}%
                      </Text>
                    )}

                    {hoveredValue && (
                      <View>
                        <Text style={{ fontWeight: 800 }}>
                          {hoveredValue.date}
                        </Text>
                        <PrivacyFilter activationFilters={[() => !isHovered]}>
                          <Text>{integerToCurrency(hoveredValue.balance)}</Text>
                        </PrivacyFilter>
                        {monthlyChange !== null && (
                          <Text
                            style={{
                              color:
                                monthlyChange >= 0
                                  ? theme.noticeTextLight
                                  : theme.errorText,
                              fontSize: 10,
                              marginTop: 2,
                            }}
                          >
                            {monthlyChange >= 0 ? '+' : ''}
                            {integerToCurrency(monthlyChange)}
                          </Text>
                        )}
                      </View>
                    )}
                  </SpaceBetween>
                )}
              </div>
            </View>
          );
        }}
      />
    </View>
  );
}
