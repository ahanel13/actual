import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useImportSnapshotsMutation } from '#balance-history';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { closeModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type ImportBalanceHistoryModalProps = Extract<
  ModalType,
  { name: 'import-balance-history' }
>['options'];

type ParsedRow = { date: string; balance: number };

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // MM/DD/YYYY
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  // MM/DD/YY
  const mdyShort = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    return `20${mdyShort[3]}-${mdyShort[1].padStart(2, '0')}-${mdyShort[2].padStart(2, '0')}`;
  }
  return null;
}

function parseBalance(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return Math.round(val * 100);
}

function parseCSV(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { rows: [], error: 'File has no data rows' };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const dateIdx = headers.findIndex(h => h === 'date');
  const balanceIdx = headers.findIndex(h => h === 'balance');

  if (dateIdx === -1 || balanceIdx === -1) {
    return {
      rows: [],
      error:
        'Could not find "Date" and "Balance" columns. Make sure the CSV has a header row.',
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const rawDate = parts[dateIdx]?.trim() ?? '';
    const rawBalance = parts[balanceIdx]?.trim() ?? '';

    const date = normalizeDate(rawDate);
    const balance = parseBalance(rawBalance);

    if (!date || balance === null) continue;
    rows.push({ date, balance });
  }

  return { rows };
}

export function ImportBalanceHistoryModal({
  accountId,
}: ImportBalanceHistoryModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSnapshots = useImportSnapshotsMutation(accountId);

  const [step, setStep] = useState<'pick' | 'preview'>('pick');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const { rows, error } = parseCSV(text);
      if (error) {
        setParseError(error);
        setStep('pick');
      } else {
        setParseError(null);
        setParsedRows(rows);
        setStep('preview');
      }
    };
    reader.readAsText(file);
  };

  const onConfirm = () => {
    importSnapshots.mutate(parsedRows, {
      onSuccess: () => dispatch(closeModal()),
    });
  };

  const firstDate = parsedRows[0]?.date;
  const lastDate = parsedRows[parsedRows.length - 1]?.date;
  const preview = parsedRows.slice(0, 5);

  const cellStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 13,
    borderBottom: `1px solid ${theme.tableBorder}`,
  };

  return (
    <Modal name="import-balance-history">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={t('Import Balance History')}
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          {step === 'pick' ? (
            <View style={{ gap: 14 }}>
              <View style={{ fontSize: 14, color: theme.pageTextSubdued }}>
                <Trans>
                  Upload a CSV file with Date and Balance columns. Monarch
                  exports work directly.
                </Trans>
              </View>

              {parseError && (
                <View
                  style={{
                    padding: '10px 14px',
                    background: theme.errorBackground,
                    color: theme.errorText,
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  {parseError}
                </View>
              )}

              <Button
                variant="primary"
                onPress={() => fileInputRef.current?.click()}
              >
                <Trans>Choose CSV File</Trans>
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={{ fontSize: 14, color: theme.pageTextSubdued }}>
                {fileName}
              </View>

              <View style={{ fontSize: 14, color: theme.pageText }}>
                <strong>{parsedRows.length.toLocaleString()}</strong>{' '}
                <Trans>snapshots found</Trans>
                {firstDate && lastDate && (
                  <>
                    {' '}
                    (<Trans>from</Trans> {firstDate} <Trans>to</Trans>{' '}
                    {lastDate})
                  </>
                )}
              </View>

              <View style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>Preview (first 5 rows):</Trans>
              </View>

              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  background: theme.tableBackground,
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        ...cellStyle,
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: 11,
                        color: theme.pageTextSubdued,
                        textTransform: 'uppercase',
                      }}
                    >
                      <Trans>Date</Trans>
                    </th>
                    <th
                      style={{
                        ...cellStyle,
                        textAlign: 'right',
                        fontWeight: 600,
                        fontSize: 11,
                        color: theme.pageTextSubdued,
                        textTransform: 'uppercase',
                      }}
                    >
                      <Trans>Balance</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      <td style={cellStyle}>{row.date}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        ${(row.balance / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {parsedRows.length > 5 && (
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          ...cellStyle,
                          textAlign: 'center',
                          color: theme.pageTextSubdued,
                          borderBottom: 'none',
                        }}
                      >
                        +{(parsedRows.length - 5).toLocaleString()}{' '}
                        <Trans>more rows</Trans>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </View>
          )}

          <ModalButtons>
            <Button
              onPress={() => {
                if (step === 'preview') {
                  setStep('pick');
                  setParsedRows([]);
                } else {
                  state.close();
                }
              }}
            >
              {step === 'preview' ? <Trans>Back</Trans> : <Trans>Cancel</Trans>}
            </Button>
            {step === 'preview' && (
              <Button
                variant="primary"
                onPress={onConfirm}
                isDisabled={
                  importSnapshots.isPending || parsedRows.length === 0
                }
                style={{ marginLeft: 10 }}
              >
                {importSnapshots.isPending
                  ? t('Importing…')
                  : t('Import {{count}} snapshots', {
                      count: parsedRows.length.toLocaleString(),
                    })}
              </Button>
            )}
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
