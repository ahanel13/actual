import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  useDeleteHoldingMutation,
  useRefreshPricesMutation,
} from '#investments/mutations';
import { useHoldings } from '#hooks/useHoldings';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type HoldingsTableProps = {
  accountId: string;
};

function formatDollar(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

export function HoldingsTable({ accountId }: HoldingsTableProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: holdings = [], isLoading } = useHoldings(accountId);
  const deleteHolding = useDeleteHoldingMutation(accountId);
  const refreshPrices = useRefreshPricesMutation(accountId);

  const totalValue = holdings.reduce((sum, h) => {
    if (h.current_price != null) return sum + h.shares * h.current_price;
    return sum;
  }, 0);

  const totalCost = holdings.reduce((sum, h) => {
    if (h.cost_basis_per_share != null)
      return sum + h.shares * h.cost_basis_per_share;
    return sum;
  }, 0);

  const totalGainLoss =
    totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null;

  const headerCellStyle: React.CSSProperties = {
    padding: '6px 10px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: theme.pageTextSubdued,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${theme.tableBorder}`,
  };

  const cellStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    color: theme.pageText,
    borderBottom: `1px solid ${theme.tableBorder}`,
    verticalAlign: 'middle',
  };

  const numCellStyle: React.CSSProperties = {
    ...cellStyle,
    textAlign: 'right',
  };

  return (
    <View style={{ marginTop: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{ fontSize: 14, fontWeight: 600, color: theme.pageText }}
        >
          <Trans>Holdings</Trans>
        </span>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            variant="bare"
            onPress={() =>
              dispatch(
                pushModal({
                  modal: { name: 'add-edit-holding', options: { accountId } },
                }),
              )
            }
          >
            + <Trans>Add Holding</Trans>
          </Button>
          <Button
            variant="bare"
            onPress={() => refreshPrices.mutate()}
            isDisabled={refreshPrices.isPending || holdings.length === 0}
          >
            {refreshPrices.isPending
              ? t('Refreshing…')
              : t('Refresh Prices')}
          </Button>
        </View>
      </View>

      {isLoading ? (
        <div style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Loading…</Trans>
        </div>
      ) : holdings.length === 0 ? (
        <div
          style={{
            color: theme.pageTextSubdued,
            fontSize: 13,
            padding: '12px 0',
          }}
        >
          <Trans>No holdings yet. Add a holding to track your portfolio.</Trans>
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: theme.tableBackground,
            borderRadius: 8,
            overflow: 'hidden',
            border: `1px solid ${theme.tableBorder}`,
          }}
        >
          <thead>
            <tr>
              <th style={headerCellStyle}>
                <Trans>Symbol</Trans>
              </th>
              <th style={headerCellStyle}>
                <Trans>Name</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Shares</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Price</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Value</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Cost</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Gain/Loss</Trans>
              </th>
              <th style={{ ...headerCellStyle, width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => {
              const value =
                h.current_price != null ? h.shares * h.current_price : null;
              const cost =
                h.cost_basis_per_share != null
                  ? h.shares * h.cost_basis_per_share
                  : null;
              const gainLossPct =
                value != null && cost != null && cost > 0
                  ? ((value - cost) / cost) * 100
                  : null;
              const gainLossAbs =
                value != null && cost != null ? value - cost : null;

              return (
                <tr key={h.id}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{h.symbol}</td>
                  <td style={{ ...cellStyle, color: theme.pageTextSubdued }}>
                    {h.name ?? '—'}
                  </td>
                  <td style={numCellStyle}>{h.shares}</td>
                  <td style={numCellStyle}>
                    {h.current_price != null
                      ? formatDollar(h.current_price)
                      : '—'}
                  </td>
                  <td style={numCellStyle}>
                    {value != null ? formatDollar(value) : '—'}
                  </td>
                  <td style={numCellStyle}>
                    {cost != null ? formatDollar(cost) : '—'}
                  </td>
                  <td
                    style={{
                      ...numCellStyle,
                      color:
                        gainLossAbs == null
                          ? theme.pageTextSubdued
                          : gainLossAbs >= 0
                            ? theme.noticeTextLight
                            : theme.errorText,
                    }}
                  >
                    {gainLossAbs != null && gainLossPct != null ? (
                      <>
                        {formatDollar(gainLossAbs)}{' '}
                        <span style={{ fontSize: 11 }}>
                          ({formatPercent(gainLossPct)})
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <View
                      style={{ flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}
                    >
                      <Button
                        variant="bare"
                        onPress={() =>
                          dispatch(
                            pushModal({
                              modal: {
                                name: 'add-edit-holding',
                                options: { accountId, holdingId: h.id },
                              },
                            }),
                          )
                        }
                        style={{ padding: '2px 6px', fontSize: 12 }}
                        aria-label={t('Edit')}
                      >
                        ✎
                      </Button>
                      <Button
                        variant="bare"
                        onPress={() => deleteHolding.mutate({ id: h.id })}
                        style={{
                          padding: '2px 6px',
                          fontSize: 12,
                          color: theme.errorText,
                        }}
                        aria-label={t('Delete')}
                      >
                        ✕
                      </Button>
                    </View>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {holdings.length > 0 && (
            <tfoot>
              <tr>
                <td
                  colSpan={4}
                  style={{
                    ...cellStyle,
                    fontWeight: 600,
                    borderTop: `2px solid ${theme.tableBorder}`,
                    borderBottom: 'none',
                  }}
                >
                  <Trans>Total Portfolio</Trans>
                </td>
                <td
                  style={{
                    ...numCellStyle,
                    fontWeight: 600,
                    borderTop: `2px solid ${theme.tableBorder}`,
                    borderBottom: 'none',
                  }}
                >
                  {totalValue > 0 ? formatDollar(totalValue) : '—'}
                </td>
                <td
                  style={{
                    ...numCellStyle,
                    borderTop: `2px solid ${theme.tableBorder}`,
                    borderBottom: 'none',
                  }}
                >
                  {totalCost > 0 ? formatDollar(totalCost) : '—'}
                </td>
                <td
                  style={{
                    ...numCellStyle,
                    fontWeight: 600,
                    borderTop: `2px solid ${theme.tableBorder}`,
                    borderBottom: 'none',
                    color:
                      totalGainLoss == null
                        ? theme.pageTextSubdued
                        : totalGainLoss >= 0
                          ? theme.noticeTextLight
                          : theme.errorText,
                  }}
                >
                  {totalGainLoss != null
                    ? formatPercent(totalGainLoss)
                    : '—'}
                </td>
                <td
                  style={{
                    ...cellStyle,
                    borderTop: `2px solid ${theme.tableBorder}`,
                    borderBottom: 'none',
                  }}
                />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </View>
  );
}
