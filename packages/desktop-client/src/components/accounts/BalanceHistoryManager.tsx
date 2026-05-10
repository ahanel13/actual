import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { BalanceHistoryEntity } from '@actual-app/core/types/models';

import {
  useDeleteSnapshotMutation,
  useCreateSnapshotMutation,
  useUpdateSnapshotMutation,
  useExportSnapshotsMutation,
} from '#balance-history';
import { useBalanceHistory } from '#hooks/useBalanceHistory';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type BalanceHistoryManagerProps = {
  accountId: string;
  accountName?: string;
};

const INITIAL_VISIBLE = 12;

export function BalanceHistoryManager({
  accountId,
  accountName,
}: BalanceHistoryManagerProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: snapshots = [], isLoading } = useBalanceHistory(accountId);
  const deleteSnapshot = useDeleteSnapshotMutation(accountId);
  const createSnapshot = useCreateSnapshotMutation(accountId);
  const updateSnapshot = useUpdateSnapshotMutation(accountId);
  const exportSnapshots = useExportSnapshotsMutation();

  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingDate, setAddingDate] = useState('');
  const [addingBalance, setAddingBalance] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);

  const sorted = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_VISIBLE);

  const onExport = () => {
    exportSnapshots.mutate(accountId, {
      onSuccess: (csv: string) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance-history-${accountName ?? accountId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  };

  const startEdit = (s: BalanceHistoryEntity) => {
    setEditingId(s.id);
    setEditValue((s.balance / 100).toFixed(2));
  };

  const saveEdit = (id: string) => {
    const val = parseFloat(editValue);
    if (!isNaN(val)) {
      updateSnapshot.mutate({ id, balance: Math.round(val * 100) });
    }
    setEditingId(null);
  };

  const onAdd = () => {
    const date = addingDate.trim();
    const val = parseFloat(addingBalance.replace(/[$,]/g, ''));
    if (!date || isNaN(val)) return;
    createSnapshot.mutate({
      account_id: accountId,
      date,
      balance: Math.round(val * 100),
    });
    setAddingDate('');
    setAddingBalance('');
    setShowAddRow(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: `1px solid ${theme.tableBorder}`,
    borderRadius: 4,
    fontSize: 13,
    color: theme.pageText,
    background: theme.tableBackground,
    width: '100%',
    boxSizing: 'border-box',
  };

  const cellStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 13,
    color: theme.pageText,
    borderBottom: `1px solid ${theme.tableBorder}`,
    verticalAlign: 'middle',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontSize: 11,
    fontWeight: 600,
    color: theme.pageTextSubdued,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
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
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.pageText }}>
          <Trans>Balance History</Trans>
        </span>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            variant="bare"
            onPress={() =>
              dispatch(
                pushModal({
                  modal: {
                    name: 'import-balance-history',
                    options: { accountId },
                  },
                }),
              )
            }
          >
            <Trans>Import CSV</Trans>
          </Button>
          <Button
            variant="bare"
            onPress={onExport}
            isDisabled={exportSnapshots.isPending || snapshots.length === 0}
          >
            <Trans>Export CSV</Trans>
          </Button>
          <Button
            variant="bare"
            onPress={() => setShowAddRow(r => !r)}
          >
            + <Trans>Add</Trans>
          </Button>
        </View>
      </View>

      {isLoading ? (
        <div style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Loading…</Trans>
        </div>
      ) : snapshots.length === 0 && !showAddRow ? (
        <div style={{ color: theme.pageTextSubdued, fontSize: 13, padding: '8px 0' }}>
          <Trans>
            No balance history yet. Import a CSV or add snapshots manually.
          </Trans>
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: theme.tableBackground,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <thead>
            <tr>
              <th style={headerCellStyle}>
                <Trans>Date</Trans>
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>
                <Trans>Balance</Trans>
              </th>
              <th style={{ ...headerCellStyle, width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {showAddRow && (
              <tr>
                <td style={cellStyle}>
                  <input
                    style={inputStyle}
                    type="date"
                    value={addingDate}
                    onChange={e => setAddingDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    autoFocus
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <input
                    style={{ ...inputStyle, textAlign: 'right' }}
                    type="number"
                    step="0.01"
                    value={addingBalance}
                    onChange={e => setAddingBalance(e.target.value)}
                    placeholder="0.00"
                    onKeyDown={e => e.key === 'Enter' && onAdd()}
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}>
                    <Button
                      variant="primary"
                      onPress={onAdd}
                      style={{ padding: '2px 8px', fontSize: 12 }}
                    >
                      <Trans>Add</Trans>
                    </Button>
                    <Button
                      variant="bare"
                      onPress={() => setShowAddRow(false)}
                      style={{ padding: '2px 6px', fontSize: 12 }}
                    >
                      ✕
                    </Button>
                  </View>
                </td>
              </tr>
            )}

            {visible.map(s => (
              <tr key={s.id}>
                <td style={cellStyle}>{s.date}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  {editingId === s.id ? (
                    <input
                      style={{ ...inputStyle, textAlign: 'right', width: 120 }}
                      type="number"
                      step="0.01"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveEdit(s.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(s.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => startEdit(s)}
                      style={{ cursor: 'pointer' }}
                      title={t('Click to edit')}
                    >
                      ${(s.balance / 100).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <Button
                    variant="bare"
                    onPress={() => deleteSnapshot.mutate({ id: s.id })}
                    style={{ padding: '2px 6px', fontSize: 12, color: theme.errorText }}
                    aria-label={t('Delete')}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          {sorted.length > INITIAL_VISIBLE && (
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    ...cellStyle,
                    textAlign: 'center',
                    borderBottom: 'none',
                    color: theme.pageTextSubdued,
                  }}
                >
                  <Button
                    variant="bare"
                    onPress={() => setShowAll(v => !v)}
                    style={{ fontSize: 13 }}
                  >
                    {showAll
                      ? t('Show fewer')
                      : t('Show all {{count}} snapshots', {
                          count: sorted.length.toLocaleString(),
                        })}
                  </Button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </View>
  );
}
