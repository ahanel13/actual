import React, { useEffect, useMemo, useState } from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { AccountEntity, HoldingWithPrice } from '@actual-app/core/types/models';
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

type TimeRange = '1mo' | '3mo' | '6mo' | '1y';

const RANGE_LABELS: Record<TimeRange, string> = {
  '1mo': '1M',
  '3mo': '3M',
  '6mo': '6M',
  '1y': '1Y',
};

const SP500_SYMBOL = 'SPY';
const PORTFOLIO_COLOR = '#f97316';
const SP500_COLOR = '#22d3ee';
const CHART_COLORS = [SP500_COLOR, PORTFOLIO_COLOR, '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

// cents from holding
function holdingValue(h: HoldingWithPrice): number {
  if (h.current_price == null) return 0;
  return Math.round(h.shares * h.current_price * 100);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

// Rules of hooks: call hooks at top level, not inside loops.
// We limit to a reasonable max; unused entries are harmless.
const MAX_ACCOUNTS = 20;
const EMPTY: HoldingWithPrice[] = [];
const EMPTY_HISTORY: { date: string; balance: number }[] = [];

function useAllAccountData(investmentAccounts: AccountEntity[]) {
  const ids = investmentAccounts.map(a => a.id);
  // Always call the same number of hooks by padding to MAX_ACCOUNTS
  const padded = ids.slice(0, MAX_ACCOUNTS);
  while (padded.length < MAX_ACCOUNTS) padded.push('');

  const h0 = useHoldings(padded[0]);
  const h1 = useHoldings(padded[1]);
  const h2 = useHoldings(padded[2]);
  const h3 = useHoldings(padded[3]);
  const h4 = useHoldings(padded[4]);
  const h5 = useHoldings(padded[5]);
  const h6 = useHoldings(padded[6]);
  const h7 = useHoldings(padded[7]);
  const h8 = useHoldings(padded[8]);
  const h9 = useHoldings(padded[9]);
  const h10 = useHoldings(padded[10]);
  const h11 = useHoldings(padded[11]);
  const h12 = useHoldings(padded[12]);
  const h13 = useHoldings(padded[13]);
  const h14 = useHoldings(padded[14]);
  const h15 = useHoldings(padded[15]);
  const h16 = useHoldings(padded[16]);
  const h17 = useHoldings(padded[17]);
  const h18 = useHoldings(padded[18]);
  const h19 = useHoldings(padded[19]);

  const b0 = useBalanceHistory(padded[0] || undefined);
  const b1 = useBalanceHistory(padded[1] || undefined);
  const b2 = useBalanceHistory(padded[2] || undefined);
  const b3 = useBalanceHistory(padded[3] || undefined);
  const b4 = useBalanceHistory(padded[4] || undefined);
  const b5 = useBalanceHistory(padded[5] || undefined);
  const b6 = useBalanceHistory(padded[6] || undefined);
  const b7 = useBalanceHistory(padded[7] || undefined);
  const b8 = useBalanceHistory(padded[8] || undefined);
  const b9 = useBalanceHistory(padded[9] || undefined);
  const b10 = useBalanceHistory(padded[10] || undefined);
  const b11 = useBalanceHistory(padded[11] || undefined);
  const b12 = useBalanceHistory(padded[12] || undefined);
  const b13 = useBalanceHistory(padded[13] || undefined);
  const b14 = useBalanceHistory(padded[14] || undefined);
  const b15 = useBalanceHistory(padded[15] || undefined);
  const b16 = useBalanceHistory(padded[16] || undefined);
  const b17 = useBalanceHistory(padded[17] || undefined);
  const b18 = useBalanceHistory(padded[18] || undefined);
  const b19 = useBalanceHistory(padded[19] || undefined);

  const allHoldings = [h0,h1,h2,h3,h4,h5,h6,h7,h8,h9,h10,h11,h12,h13,h14,h15,h16,h17,h18,h19];
  const allHistory = [b0,b1,b2,b3,b4,b5,b6,b7,b8,b9,b10,b11,b12,b13,b14,b15,b16,b17,b18,b19];

  return investmentAccounts.map((account, i) => ({
    account,
    holdings: allHoldings[i]?.data ?? EMPTY,
    history: allHistory[i]?.data ?? EMPTY_HISTORY,
  }));
}

function useSP500Chart(range: TimeRange) {
  const [data, setData] = useState<{ date: string; pct: number }[]>([]);

  useEffect(() => {
    setData([]);
    send('yahoo-chart', { symbol: SP500_SYMBOL, range })
      .then((result: { timestamps?: number[]; closes?: number[] } | null) => {
        if (!result?.timestamps?.length || !result.closes?.length) return;
        const timestamps = result.timestamps;
        const closes = result.closes;
        const firstClose = closes.find((c): c is number => c != null) ?? 1;
        const points = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            pct: closes[i] != null
              ? ((closes[i] - firstClose) / Math.abs(firstClose)) * 100
              : null,
          }))
          .filter(p => p.pct != null) as { date: string; pct: number }[];
        setData(points);
      })
      .catch(() => setData([]));
  }, [range]);

  return data;
}

// ─── Performance calc ─────────────────────────────────────────────────────────

function buildPortfolioSeries(
  accountData: { history: { date: string; balance: number }[] }[],
  range: TimeRange,
): { date: string; pct: number }[] {
  const daysBack = range === '1mo' ? 31 : range === '3mo' ? 92 : range === '6mo' ? 183 : 366;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dateMap = new Map<string, number>();
  for (const { history } of accountData) {
    for (const snap of history) {
      if (snap.date < cutoffStr) continue;
      dateMap.set(snap.date, (dateMap.get(snap.date) ?? 0) + snap.balance);
    }
  }

  const sorted = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, balance]) => ({ date, balance }));

  if (sorted.length < 2) return [];
  const firstBalance = sorted[0].balance;
  if (firstBalance === 0) return [];

  return sorted.map(({ date, balance }) => ({
    date,
    pct: ((balance - firstBalance) / Math.abs(firstBalance)) * 100,
  }));
}

function mergeSeries(
  portfolio: { date: string; pct: number }[],
  sp500: { date: string; pct: number }[],
): { date: string; portfolio?: number; sp500?: number }[] {
  const map = new Map<string, { portfolio?: number; sp500?: number }>();
  for (const p of portfolio) map.set(p.date, { portfolio: p.pct });
  for (const s of sp500) {
    const existing = map.get(s.date) ?? {};
    map.set(s.date, { ...existing, sp500: s.pct });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, pct, dot }: { label: string; pct: number | null; dot: string }) {
  return (
    <div
      style={{
        background: theme.tableBackground,
        borderRadius: 10,
        padding: '14px 20px',
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>{label}</span>
      </div>
      {pct == null ? (
        <span style={{ fontSize: 20, fontWeight: 700, color: theme.pageTextSubdued }}>—</span>
      ) : (
        <span style={{ fontSize: 20, fontWeight: 700, color: pct >= 0 ? theme.noticeTextLight : theme.errorText }}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function AllocationSection({
  accountData,
}: {
  accountData: { account: AccountEntity; holdings: HoldingWithPrice[] }[];
}) {
  const rows = accountData
    .map(({ account, holdings }) => ({
      name: account.name,
      value: holdings.reduce((s, h) => s + holdingValue(h), 0),
    }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) return null;

  return (
    <View style={{ background: theme.cardBackground, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: theme.pageText, marginBottom: 16 }}>Portfolio allocation</div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {rows.map((row, i) => {
            const pct = (row.value / total) * 100;
            return (
              <div key={row.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: theme.pageTextSubdued }}>
                  <span>{row.name}</span>
                  <span>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: theme.tableBackground, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ minWidth: 240 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 16px', fontSize: 13 }}>
            <span style={{ color: theme.pageTextSubdued, fontWeight: 600 }}>Account</span>
            <span style={{ color: theme.pageTextSubdued, fontWeight: 600, textAlign: 'right' }}>%</span>
            <span style={{ color: theme.pageTextSubdued, fontWeight: 600, textAlign: 'right' }}>Value</span>
            {rows.map((row, i) => (
              <React.Fragment key={row.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: theme.pageText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                </div>
                <span style={{ color: theme.pageText, textAlign: 'right' }}>{((row.value / total) * 100).toFixed(1)}%</span>
                <span style={{ color: theme.pageText, textAlign: 'right', fontWeight: 500 }}>${integerToCurrency(row.value)}</span>
              </React.Fragment>
            ))}
            <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.tableBorder}`, margin: '4px 0' }} />
            <span style={{ fontWeight: 700, color: theme.pageText }}>Total</span>
            <span style={{ fontWeight: 700, color: theme.pageText, textAlign: 'right' }}>100%</span>
            <span style={{ fontWeight: 700, color: theme.pageText, textAlign: 'right' }}>${integerToCurrency(total)}</span>
          </div>
        </div>
      </div>
    </View>
  );
}

function HoldingsSection({
  accountData,
}: {
  accountData: { account: AccountEntity; holdings: HoldingWithPrice[] }[];
}) {
  const allHoldings = accountData
    .flatMap(({ account, holdings }) => holdings.map(h => ({ ...h, accountName: account.name })))
    .sort((a, b) => holdingValue(b) - holdingValue(a));

  if (allHoldings.length === 0) {
    return (
      <View style={{ background: theme.cardBackground, borderRadius: 12, padding: 32, textAlign: 'center', color: theme.pageTextSubdued, fontSize: 14 }}>
        No holdings found. Add holdings from an investment account page.
      </View>
    );
  }

  return (
    <View style={{ background: theme.cardBackground, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 80px 110px 120px', padding: '10px 20px', borderBottom: `1px solid ${theme.tableBorder}`, fontSize: 12, fontWeight: 600, color: theme.pageTextSubdued }}>
        <span>Symbol</span>
        <span>Name</span>
        <span>Account</span>
        <span style={{ textAlign: 'right' }}>Shares</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Value</span>
        <span style={{ textAlign: 'right' }}>Gain/Loss</span>
      </div>
      {allHoldings.map(h => {
        const value = holdingValue(h);
        const costBasis = h.cost_basis_per_share != null
          ? Math.round(h.shares * h.cost_basis_per_share * 100)
          : null;
        const gainLoss = costBasis != null && costBasis > 0 ? value - costBasis : null;
        const gainPct = gainLoss != null && costBasis != null && costBasis > 0
          ? (gainLoss / costBasis) * 100
          : null;

        return (
          <div
            key={h.id}
            style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px 80px 110px 120px', padding: '12px 20px', borderBottom: `1px solid ${theme.tableBorder}`, fontSize: 13, alignItems: 'center' }}
          >
            <span style={{ fontWeight: 600, color: theme.pageText }}>{h.symbol}</span>
            <span style={{ color: theme.pageTextSubdued, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{h.name ?? h.symbol}</span>
            <span style={{ color: theme.pageTextSubdued, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{h.accountName}</span>
            <span style={{ textAlign: 'right', color: theme.pageText }}>{h.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            <span style={{ textAlign: 'right', color: theme.pageText }}>{h.current_price != null ? `$${h.current_price.toFixed(2)}` : '—'}</span>
            <span style={{ textAlign: 'right', fontWeight: 500, color: theme.pageText }}>{value > 0 ? `$${integerToCurrency(value)}` : '—'}</span>
            <span style={{ textAlign: 'right', color: gainLoss == null ? theme.pageTextSubdued : gainLoss >= 0 ? theme.noticeTextLight : theme.errorText }}>
              {gainLoss == null ? '—' : (
                <span>
                  {gainLoss >= 0 ? '+' : '-'}${integerToCurrency(Math.abs(gainLoss))}
                  {gainPct != null && (
                    <span style={{ fontSize: 11, marginLeft: 4, display: 'block' }}>
                      ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </View>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function InvestmentsDashboard() {
  const [range, setRange] = useState<TimeRange>('3mo');
  const { data: allAccounts = [] } = useAccounts();
  const investmentAccounts = useMemo(
    () => allAccounts.filter(a => a.type === 'investment' && !a.closed && !a.tombstone),
    [allAccounts],
  );

  const accountData = useAllAccountData(investmentAccounts);
  const sp500Data = useSP500Chart(range);

  const portfolioSeries = useMemo(
    () => buildPortfolioSeries(accountData, range),
    [accountData, range],
  );

  const chartData = useMemo(
    () => mergeSeries(portfolioSeries, sp500Data),
    [portfolioSeries, sp500Data],
  );

  const portfolioPct = portfolioSeries.length >= 2 ? portfolioSeries[portfolioSeries.length - 1].pct : null;
  const sp500Pct = sp500Data.length >= 2 ? sp500Data[sp500Data.length - 1].pct : null;

  const totalPortfolioValue = useMemo(
    () => accountData.reduce((sum, { holdings }) => sum + holdings.reduce((s, h) => s + holdingValue(h), 0), 0),
    [accountData],
  );

  const formatDateTick = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <View style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: theme.pageText }}>Investments</div>
          {totalPortfolioValue > 0 && (
            <div style={{ fontSize: 28, fontWeight: 700, color: theme.pageText, marginTop: 4 }}>
              ${integerToCurrency(totalPortfolioValue)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, backgroundColor: theme.tableBackground, borderRadius: 8, padding: 4 }}>
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                backgroundColor: range === r ? theme.cardBackground : 'transparent',
                color: range === r ? theme.pageText : theme.pageTextSubdued,
                boxShadow: range === r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Performance chart */}
      <View style={{ background: theme.cardBackground, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: theme.pageText, marginBottom: 16 }}>
          Performance vs S&amp;P 500
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label="Your Portfolio" pct={portfolioPct} dot={PORTFOLIO_COLOR} />
          <StatCard label="S&P 500 (SPY)" pct={sp500Pct} dot={SP500_COLOR} />
        </div>

        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.tableBorder} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fontSize: 11, fill: theme.pageTextSubdued }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                tick={{ fontSize: 11, fill: theme.pageTextSubdued }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <ReferenceLine y={0} stroke={theme.tableBorder} />
              <Tooltip
                contentStyle={{ background: theme.cardBackground, border: `1px solid ${theme.tableBorder}`, borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke={PORTFOLIO_COLOR} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="sp500" name="S&P 500" stroke={SP500_COLOR} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.pageTextSubdued, fontSize: 14 }}>
            {investmentAccounts.length === 0
              ? 'No investment accounts found. Create an investment account to get started.'
              : 'Not enough balance history to show performance. Import balance history to enable this chart.'}
          </div>
        )}
      </View>

      {/* Allocation */}
      <AllocationSection accountData={accountData} />

      {/* Holdings */}
      <div style={{ fontWeight: 700, fontSize: 15, color: theme.pageText, marginBottom: 12 }}>Holdings</div>
      <HoldingsSection accountData={accountData} />
    </View>
  );
}
