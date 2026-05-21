import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trans } from 'react-i18next';


import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  HoldingWithPrice,
} from '@actual-app/core/types/models';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAccounts } from '#hooks/useAccounts';
import { useBalanceHistory } from '#hooks/useBalanceHistory';
import { useHoldings } from '#hooks/useHoldings';
import { useNavigate } from '#hooks/useNavigate';
import { useRefreshAllPricesMutation } from '#investments/mutations';

type TimeRange = '1mo' | '3mo' | '6mo' | '1y';

const STALE_MINUTES = 15;

function oldestPriceFetch(accountData: { holdings: HoldingWithPrice[] }[]): {
  oldest: string | null;
  hasMissing: boolean;
  hasHoldings: boolean;
} {
  let oldest: string | null = null;
  let hasMissing = false;
  let hasHoldings = false;
  for (const { holdings } of accountData) {
    for (const h of holdings) {
      if (h.shares === 0) continue;
      hasHoldings = true;
      if (h.price_fetched_at == null) {
        hasMissing = true;
      } else if (oldest == null || h.price_fetched_at < oldest) {
        oldest = h.price_fetched_at;
      }
    }
  }
  return { oldest, hasMissing, hasHoldings };
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '1mo': '1M',
  '3mo': '3M',
  '6mo': '6M',
  '1y': '1Y',
};

const SP500_SYMBOL = 'SPY';
const PORTFOLIO_COLOR = '#f97316';
const SP500_COLOR = '#22d3ee';
const ALLOC_COLORS = [
  '#22d3ee',
  '#f97316',
  '#a855f7',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
];

function holdingValueCents(h: HoldingWithPrice): number {
  if (h.current_price == null) return 0;
  return Math.round(h.shares * h.current_price * 100);
}

// ─── Fixed-count hook pattern (rules of hooks) ────────────────────────────────

const MAX_ACCTS = 20;
const NO_HOLDINGS: HoldingWithPrice[] = [];
const NO_HISTORY: { date: string; balance: number }[] = [];

function useAllAccountData(investmentAccounts: AccountEntity[]) {
  const pad = (arr: string[]) => {
    while (arr.length < MAX_ACCTS) arr.push('');
    return arr;
  };
  const ids = pad(investmentAccounts.map(a => a.id).slice(0, MAX_ACCTS));

  /* eslint-disable react-hooks/rules-of-hooks */
  const hs = [
    useHoldings(ids[0]),
    useHoldings(ids[1]),
    useHoldings(ids[2]),
    useHoldings(ids[3]),
    useHoldings(ids[4]),
    useHoldings(ids[5]),
    useHoldings(ids[6]),
    useHoldings(ids[7]),
    useHoldings(ids[8]),
    useHoldings(ids[9]),
    useHoldings(ids[10]),
    useHoldings(ids[11]),
    useHoldings(ids[12]),
    useHoldings(ids[13]),
    useHoldings(ids[14]),
    useHoldings(ids[15]),
    useHoldings(ids[16]),
    useHoldings(ids[17]),
    useHoldings(ids[18]),
    useHoldings(ids[19]),
  ];
  const bs = [
    useBalanceHistory(ids[0] || undefined),
    useBalanceHistory(ids[1] || undefined),
    useBalanceHistory(ids[2] || undefined),
    useBalanceHistory(ids[3] || undefined),
    useBalanceHistory(ids[4] || undefined),
    useBalanceHistory(ids[5] || undefined),
    useBalanceHistory(ids[6] || undefined),
    useBalanceHistory(ids[7] || undefined),
    useBalanceHistory(ids[8] || undefined),
    useBalanceHistory(ids[9] || undefined),
    useBalanceHistory(ids[10] || undefined),
    useBalanceHistory(ids[11] || undefined),
    useBalanceHistory(ids[12] || undefined),
    useBalanceHistory(ids[13] || undefined),
    useBalanceHistory(ids[14] || undefined),
    useBalanceHistory(ids[15] || undefined),
    useBalanceHistory(ids[16] || undefined),
    useBalanceHistory(ids[17] || undefined),
    useBalanceHistory(ids[18] || undefined),
    useBalanceHistory(ids[19] || undefined),
  ];
  /* eslint-enable react-hooks/rules-of-hooks */

  return investmentAccounts.map((account, i) => ({
    account,
    holdings: hs[i]?.data ?? NO_HOLDINGS,
    history: bs[i]?.data ?? NO_HISTORY,
  }));
}

// ─── S&P 500 historical data ──────────────────────────────────────────────────

function useSP500Chart(range: TimeRange) {
  const [data, setData] = useState<{ date: string; pct: number }[]>([]);

  useEffect(() => {
    setData([]);
    send('yahoo-chart', { symbol: SP500_SYMBOL, range })
      .then((result: { timestamps?: number[]; closes?: number[] } | null) => {
        if (!result?.timestamps?.length || !result.closes?.length) return;
        const { timestamps, closes } = result;
        const firstClose = closes.find((c): c is number => c != null) ?? 1;
        setData(
          timestamps
            .map((ts, i) => ({
              date: new Date(ts * 1000).toISOString().slice(0, 10),
              pct:
                closes[i] != null
                  ? ((closes[i] - firstClose) / Math.abs(firstClose)) * 100
                  : null,
            }))
            .filter((p): p is { date: string; pct: number } => p.pct != null),
        );
      })
      .catch(() => setData([]));
  }, [range]);

  return data;
}

// ─── Portfolio % series from balance history ──────────────────────────────────

function buildPortfolioSeries(
  accountData: { history: { date: string; balance: number }[] }[],
  range: TimeRange,
): { date: string; pct: number }[] {
  const days =
    range === '1mo' ? 31 : range === '3mo' ? 92 : range === '6mo' ? 183 : 366;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const map = new Map<string, number>();
  for (const { history } of accountData) {
    for (const s of history) {
      if (s.date < cutoffStr) continue;
      map.set(s.date, (map.get(s.date) ?? 0) + s.balance);
    }
  }

  const sorted = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, balance]) => ({ date, balance }));

  if (sorted.length < 2) return [];
  const first = sorted[0].balance;
  if (first === 0) return [];
  return sorted.map(({ date, balance }) => ({
    date,
    pct: ((balance - first) / Math.abs(first)) * 100,
  }));
}

function mergeSeries(
  portfolio: { date: string; pct: number }[],
  sp500: { date: string; pct: number }[],
): { date: string; portfolio?: number; sp500?: number }[] {
  const map = new Map<string, { portfolio?: number; sp500?: number }>();
  for (const p of portfolio) map.set(p.date, { portfolio: p.pct });
  for (const s of sp500) map.set(s.date, { ...map.get(s.date), sp500: s.pct });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}

// ─── RangePicker ──────────────────────────────────────────────────────────────

function RangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        backgroundColor: theme.tableBackground,
        borderRadius: 8,
        padding: 3,
      }}
    >
      {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
        <button
          key={r}
          onClick={() => onChange(r)}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: value === r ? theme.cardBackground : 'transparent',
            color: value === r ? theme.pageText : theme.pageTextSubdued,
            boxShadow: value === r ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  pct,
  dot,
}: {
  label: string;
  pct: number | null;
  dot: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: theme.tableBackground,
        borderRadius: 10,
        minWidth: 180,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: dot,
          flexShrink: 0,
        }}
      />
      <div>
        <div
          style={{
            fontSize: 12,
            color: theme.pageTextSubdued,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color:
              pct == null
                ? theme.pageTextSubdued
                : pct >= 0
                  ? theme.noticeTextLight
                  : theme.errorText,
          }}
        >
          {pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
        </div>
      </div>
    </div>
  );
}

// ─── AllocationSection ────────────────────────────────────────────────────────

function AllocationSection({
  accountData,
}: {
  accountData: { account: AccountEntity; holdings: HoldingWithPrice[] }[];
}) {
  const navigate = useNavigate();
  const rows = accountData
    .map(({ account, holdings }) => ({
      id: account.id,
      name: account.name,
      value: holdings.reduce((s, h) => s + holdingValueCents(h), 0),
      hasHoldings: holdings.length > 0,
    }))
    .filter(r => r.hasHoldings)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.value, 0);
  const hasPrices = total > 0;

  return (
    <View
      style={{
        background: theme.cardBackground,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        padding: '20px 24px',
        marginBottom: 24,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          color: theme.pageText,
          marginBottom: 20,
        }}
      ><Trans>
        Portfolio allocation
      </Trans></div>
      <div
        style={{
          display: 'flex',
          gap: 40,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        {/* Bars */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          {rows.map((row, i) => {
            const pct = hasPrices ? (row.value / total) * 100 : 0;
            return (
              <div key={row.name} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 5,
                    fontSize: 12,
                    color: theme.pageTextSubdued,
                  }}
                >
                  <span
                    onClick={() => navigate(`/accounts/${row.id}`)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                      paddingRight: 8,
                      cursor: 'pointer',
                      color: theme.pageTextLink ?? theme.pageText,
                    }}
                  >
                    {row.name}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    {hasPrices ? `${pct.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    borderRadius: 5,
                    background: theme.tableBackground,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: 5,
                      background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* Table */}
        <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: '100%' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 60px 110px',
              gap: '8px 12px',
              fontSize: 13,
            }}
          >
            <span
              style={{
                color: theme.pageTextSubdued,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Account
            </span>
            <span
              style={{
                color: theme.pageTextSubdued,
                fontWeight: 600,
                fontSize: 12,
                textAlign: 'right',
              }}
            >
              %
            </span>
            <span
              style={{
                color: theme.pageTextSubdued,
                fontWeight: 600,
                fontSize: 12,
                textAlign: 'right',
              }}
            >
              Value
            </span>
            {rows.map((row, i) => (
              <React.Fragment key={row.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    onClick={() => navigate(`/accounts/${row.id}`)}
                    style={{
                      color: theme.pageTextLink ?? theme.pageText,
                      overflowWrap: 'anywhere',
                      minWidth: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {row.name}
                  </span>
                </div>
                <span style={{ color: theme.pageText, textAlign: 'right' }}>
                  {hasPrices
                    ? `${((row.value / total) * 100).toFixed(1)}%`
                    : '—'}
                </span>
                <span
                  style={{
                    color: hasPrices ? theme.pageText : theme.pageTextSubdued,
                    textAlign: 'right',
                    fontWeight: 500,
                  }}
                >
                  {hasPrices ? integerToCurrency(row.value) : '—'}
                </span>
              </React.Fragment>
            ))}
            <div
              style={{
                gridColumn: '1 / -1',
                borderTop: `1px solid ${theme.tableBorder}`,
                margin: '4px 0',
              }}
            />
            <span style={{ fontWeight: 700, color: theme.pageText }}>
              Total
            </span>
            <span
              style={{
                fontWeight: 700,
                color: theme.pageText,
                textAlign: 'right',
              }}
            >
              {hasPrices ? '100%' : '—'}
            </span>
            <span
              style={{
                fontWeight: 700,
                color: hasPrices ? theme.pageText : theme.pageTextSubdued,
                textAlign: 'right',
              }}
            >
              {hasPrices ? integerToCurrency(total) : '—'}
            </span>
          </div>
        </div>
      </div>
    </View>
  );
}

// ─── HoldingsSection ──────────────────────────────────────────────────────────

function HoldingsSection({
  accountData,
}: {
  accountData: { account: AccountEntity; holdings: HoldingWithPrice[] }[];
}) {
  const navigate = useNavigate();
  const allHoldings = accountData
    .flatMap(({ account, holdings }) =>
      holdings.map(h => ({
        ...h,
        accountName: account.name,
        accountId: account.id,
      })),
    )
    .sort((a, b) => holdingValueCents(b) - holdingValueCents(a));

  if (allHoldings.length === 0) {
    return (
      <View
        style={{
          background: theme.cardBackground,
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          color: theme.pageTextSubdued,
          fontSize: 14,
        }}
      >
        No holdings found. Add holdings from an investment account page.
      </View>
    );
  }

  const cols = '80px minmax(0, 1.4fr) minmax(0, 1fr) 90px 90px 120px 130px';

  return (
    <View
      style={{
        background: theme.cardBackground,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          padding: '10px 20px',
          borderBottom: `1px solid ${theme.tableBorder}`,
          fontSize: 11,
          fontWeight: 600,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span>Symbol</span>
        <span>Name</span>
        <span>Account</span>
        <span style={{ textAlign: 'right' }}>Shares</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Value</span>
        <span style={{ textAlign: 'right' }}>Gain / Loss</span>
      </div>
      {allHoldings.map(h => {
        const value = holdingValueCents(h);
        const costBasis =
          h.cost_basis_per_share != null
            ? Math.round(h.shares * h.cost_basis_per_share * 100)
            : null;
        const gainLoss =
          costBasis != null && costBasis > 0 ? value - costBasis : null;
        const gainPct =
          gainLoss != null && costBasis ? (gainLoss / costBasis) * 100 : null;

        return (
          <div
            key={h.id}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              padding: '11px 20px',
              borderBottom: `1px solid ${theme.tableBorder}`,
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 700, color: theme.pageText }}>
              {h.symbol}
            </span>
            <span
              style={{
                color: theme.pageTextSubdued,
                overflowWrap: 'anywhere',
                paddingRight: 10,
                minWidth: 0,
              }}
            >
              {h.name ?? h.symbol}
            </span>
            <span
              onClick={() => navigate(`/accounts/${h.accountId}`)}
              style={{
                color: theme.pageTextLink ?? theme.pageTextSubdued,
                overflowWrap: 'anywhere',
                paddingRight: 10,
                fontSize: 12,
                minWidth: 0,
                cursor: 'pointer',
              }}
            >
              {h.accountName}
            </span>
            <span style={{ textAlign: 'right', color: theme.pageText }}>
              {h.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })}
            </span>
            <span style={{ textAlign: 'right', color: theme.pageText }}>
              {h.current_price != null ? `$${h.current_price.toFixed(2)}` : '—'}
            </span>
            <span
              style={{
                textAlign: 'right',
                fontWeight: 600,
                color: theme.pageText,
              }}
            >
              {value > 0 ? integerToCurrency(value) : '—'}
            </span>
            <div style={{ textAlign: 'right' }}>
              {gainLoss == null ? (
                <span style={{ color: theme.pageTextSubdued }}>—</span>
              ) : (
                <>
                  <div
                    style={{
                      color:
                        gainLoss >= 0 ? theme.noticeTextLight : theme.errorText,
                      fontWeight: 600,
                    }}
                  >
                    {gainLoss >= 0 ? '+' : '-'}
                    {integerToCurrency(Math.abs(gainLoss))}
                  </div>
                  {gainPct != null && (
                    <div
                      style={{
                        fontSize: 11,
                        color:
                          gainLoss >= 0
                            ? theme.noticeTextLight
                            : theme.errorText,
                      }}
                    >
                      {gainPct >= 0 ? '+' : ''}
                      {gainPct.toFixed(1)}%
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </View>
  );
}

// ─── ViewTabs ─────────────────────────────────────────────────────────────────

type ActiveView = 'performance' | 'allocation';

function ViewTabs({
  value,
  onChange,
}: {
  value: ActiveView;
  onChange: (v: ActiveView) => void;
}) {
  const tabs: { value: ActiveView; label: string }[] = [
    { value: 'performance', label: 'Performance' },
    { value: 'allocation', label: 'Allocation' },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 2,
        backgroundColor: theme.tableBackground,
        borderRadius: 10,
        padding: 4,
      }}
    >
      {tabs.map(tab => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            style={{
              padding: '7px 18px',
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              backgroundColor: active ? theme.cardBackground : 'transparent',
              color: active ? theme.pageText : theme.pageTextSubdued,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              if (!active) e.currentTarget.style.color = theme.pageText;
            }}
            onMouseLeave={e => {
              if (!active) e.currentTarget.style.color = theme.pageTextSubdued;
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function InvestmentsDashboard() {
  const [range, setRange] = useState<TimeRange>('3mo');
  const [view, setView] = useState<ActiveView>('performance');
  const { data: allAccounts = [] } = useAccounts();
  const investmentAccounts = useMemo(
    () =>
      allAccounts.filter(
        a => a.type === 'investment' && !a.closed && !a.tombstone,
      ),
    [allAccounts],
  );

  const accountData = useAllAccountData(investmentAccounts);
  const sp500Data = useSP500Chart(range);

  const refreshAll = useRefreshAllPricesMutation();
  const autoCheckedRef = useRef(false);

  const {
    oldest: oldestFetch,
    hasMissing,
    hasHoldings,
  } = useMemo(() => oldestPriceFetch(accountData), [accountData]);

  useEffect(() => {
    if (autoCheckedRef.current) return;
    if (!hasHoldings) return;
    autoCheckedRef.current = true;
    const isStale =
      hasMissing ||
      !oldestFetch ||
      Date.now() - new Date(oldestFetch).getTime() > STALE_MINUTES * 60_000;
    if (isStale) {
      refreshAll.mutate();
    }
  }, [hasHoldings, hasMissing, oldestFetch, refreshAll]);

  const portfolioSeries = useMemo(
    () => buildPortfolioSeries(accountData, range),
    [accountData, range],
  );
  const chartData = useMemo(
    () => mergeSeries(portfolioSeries, sp500Data),
    [portfolioSeries, sp500Data],
  );

  const portfolioPct =
    portfolioSeries.length >= 2
      ? portfolioSeries[portfolioSeries.length - 1].pct
      : null;
  const sp500Pct =
    sp500Data.length >= 2 ? sp500Data[sp500Data.length - 1].pct : null;

  const totalValue = useMemo(
    () =>
      accountData.reduce(
        (sum, { holdings }) =>
          sum + holdings.reduce((s, h) => s + holdingValueCents(h), 0),
        0,
      ),
    [accountData],
  );

  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <View style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 4,
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.pageText }}>
            Investments
          </div>
          {totalValue > 0 && (
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: theme.pageText,
                marginTop: 2,
              }}
            >
              {integerToCurrency(totalValue)}
            </div>
          )}
        </div>
        {hasHoldings && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
              marginTop: 4,
            }}
          >
            <button
              onClick={() => refreshAll.mutate()}
              disabled={refreshAll.isPending}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: `1px solid ${theme.tableBorder}`,
                background: refreshAll.isPending
                  ? theme.tableBackground
                  : theme.cardBackground,
                color: theme.pageText,
                fontSize: 13,
                fontWeight: 600,
                cursor: refreshAll.isPending ? 'default' : 'pointer',
                opacity: refreshAll.isPending ? 0.6 : 1,
              }}
            >
              {refreshAll.isPending ? 'Refreshing…' : t('Refresh prices')}
            </button>
            <div
              style={{
                fontSize: 11,
                color: theme.pageTextSubdued,
              }}
            >
              {hasMissing
                ? t('Prices not yet fetched')
                : oldestFetch
                  ? `Updated ${formatTimeAgo(oldestFetch)}`
                  : ''}
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <ViewTabs value={view} onChange={setView} />
      </div>

      {/* Performance card */}
      {view === 'performance' && (
        <View
          style={{
            background: theme.cardBackground,
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: '20px 24px',
            marginBottom: 24,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Card header with range picker */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span
              style={{ fontWeight: 700, fontSize: 15, color: theme.pageText }}
            >
              Performance vs S&amp;P 500
            </span>
            <RangePicker value={range} onChange={setRange} />
          </div>

          {/* Stat cards */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}
          >
            <StatCard
              label={t("Your Portfolio")}
              pct={portfolioPct}
              dot={PORTFOLIO_COLOR}
            />
            <StatCard label="S&P 500 (SPY)" pct={sp500Pct} dot={SP500_COLOR} />
          </div>

          {/* Chart */}
          {chartData.length > 1 ? (
            <div style={{ width: '100%', height: 320, overflow: 'hidden' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={theme.tableBorder}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 11, fill: theme.pageTextSubdued }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    tickFormatter={v =>
                      `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`
                    }
                    tick={{ fontSize: 11, fill: theme.pageTextSubdued }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    padding={{ top: 8, bottom: 8 }}
                    tickCount={6}
                  />
                  <ReferenceLine
                    y={0}
                    stroke={theme.tableBorder}
                    strokeWidth={1}
                  />
                  <Tooltip
                    contentStyle={{
                      background: theme.cardBackground,
                      border: `1px solid ${theme.tableBorder}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    formatter={name =>
                      name === 'portfolio' ? 'Portfolio' : 'S&P 500'
                    }
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="portfolio"
                    stroke={PORTFOLIO_COLOR}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="sp500"
                    name="sp500"
                    stroke={SP500_COLOR}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div
              style={{
                height: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.pageTextSubdued,
                fontSize: 14,
              }}
            >
              {investmentAccounts.length === 0
                ? 'No investment accounts found.'
                : 'Import balance history to see performance over time.'}
            </div>
          )}
        </View>
      )}

      {/* Allocation tab content */}
      {view === 'allocation' && <AllocationSection accountData={accountData} />}

      {/* Holdings — always visible */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, color: theme.pageText }}>
          Holdings
        </span>
      </div>
      <HoldingsSection accountData={accountData} />
    </View>
  );
}
