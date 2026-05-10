import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  useCreateHoldingMutation,
  useUpdateHoldingMutation,
} from '#investments/mutations';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useHoldings } from '#hooks/useHoldings';
import { closeModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type AddEditHoldingModalProps = Extract<
  ModalType,
  { name: 'add-edit-holding' }
>['options'];

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: `1px solid ${theme.tableBorder}`,
  borderRadius: 6,
  fontSize: 14,
  color: theme.pageText,
  background: theme.tableBackground,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: theme.pageTextSubdued,
  marginBottom: 4,
};

export function AddEditHoldingModal({
  accountId,
  holdingId,
}: AddEditHoldingModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: holdings = [] } = useHoldings(accountId);
  const createHolding = useCreateHoldingMutation(accountId);
  const updateHolding = useUpdateHoldingMutation(accountId);

  const existing = holdingId
    ? holdings.find(h => h.id === holdingId)
    : undefined;

  const [symbol, setSymbol] = useState(existing?.symbol ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [shares, setShares] = useState(
    existing ? String(existing.shares) : '',
  );
  const [costBasis, setCostBasis] = useState(
    existing?.cost_basis_per_share != null
      ? String(existing.cost_basis_per_share)
      : '',
  );

  useEffect(() => {
    if (existing) {
      setSymbol(existing.symbol);
      setName(existing.name ?? '');
      setShares(String(existing.shares));
      setCostBasis(
        existing.cost_basis_per_share != null
          ? String(existing.cost_basis_per_share)
          : '',
      );
    }
  }, [existing]);

  const onSave = () => {
    const parsedShares = parseFloat(shares);
    if (!symbol.trim() || isNaN(parsedShares) || parsedShares <= 0) return;

    const holdingData = {
      account_id: accountId,
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || null,
      shares: parsedShares,
      cost_basis_per_share: costBasis ? parseFloat(costBasis) || null : null,
      currency: 'USD',
    };

    if (holdingId) {
      updateHolding.mutate({ id: holdingId, ...holdingData });
    } else {
      createHolding.mutate(holdingData);
    }
    dispatch(closeModal());
  };

  const isValid =
    symbol.trim().length > 0 &&
    !isNaN(parseFloat(shares)) &&
    parseFloat(shares) > 0;

  return (
    <Modal name="add-edit-holding">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={holdingId ? t('Edit Holding') : t('Add Holding')}
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          <View style={{ gap: 14 }}>
            <View>
              <div style={labelStyle}>
                <Trans>Symbol *</Trans>
              </div>
              <input
                style={inputStyle}
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. AAPL"
                autoFocus
              />
            </View>

            <View>
              <div style={labelStyle}>
                <Trans>Name (optional)</Trans>
              </div>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Apple Inc."
              />
            </View>

            <View>
              <div style={labelStyle}>
                <Trans>Shares *</Trans>
              </div>
              <input
                style={inputStyle}
                type="number"
                step="any"
                min="0"
                value={shares}
                onChange={e => setShares(e.target.value)}
                placeholder="e.g. 10.5"
              />
            </View>

            <View>
              <div style={labelStyle}>
                <Trans>Cost Basis / Share (optional)</Trans>
              </div>
              <input
                style={inputStyle}
                type="number"
                step="any"
                min="0"
                value={costBasis}
                onChange={e => setCostBasis(e.target.value)}
                placeholder="e.g. 150.00"
              />
            </View>
          </View>

          <ModalButtons>
            <Button onPress={() => state.close()}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              onPress={onSave}
              isDisabled={!isValid}
              style={{ marginLeft: 10 }}
            >
              <Trans>Save</Trans>
            </Button>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
