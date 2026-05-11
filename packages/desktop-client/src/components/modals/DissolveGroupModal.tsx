import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { useQueryClient } from '@tanstack/react-query';

import { categoryQueries } from '#budget/queries';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useCategories } from '#hooks/useCategories';
import type { Modal as ModalType } from '#modals/modalsSlice';

type DissolveGroupModalProps = Extract<
  ModalType,
  { name: 'dissolve-group' }
>['options'];

export function DissolveGroupModal({ groupId }: DissolveGroupModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const {
    data: { grouped: categoryGroups } = { grouped: [] },
  } = useCategories();

  const group = categoryGroups.find(g => g.id === groupId);
  if (!group) return null;

  const categories = group.categories?.filter(c => !c.tombstone) ?? [];

  const candidates = categoryGroups.filter(
    g =>
      !g.tombstone &&
      g.id !== groupId &&
      !!g.is_income === !!group.is_income &&
      !!g.is_savings === !!group.is_savings,
  );

  const handleDissolve = async (close: () => void) => {
    if (!targetGroupId) {
      setError('required');
      return;
    }
    setWorking(true);
    try {
      for (const cat of categories) {
        await send('category-update', { ...cat, group: targetGroupId });
      }
      await send('category-group-delete', { id: groupId });
      await queryClient.invalidateQueries({ queryKey: categoryQueries.lists() });
      close();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal name="dissolve-group" containerProps={{ style: { width: '30vw' } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Remove grouping')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5 }}>
            <Text style={{ marginBottom: 16 }}>
              <Trans>
                Move all categories from{' '}
                <strong>{{ group: group.name } as any}</strong> into another
                group, then remove the grouping. Transactions and budgets are
                unchanged.
              </Trans>
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                <Trans>Move categories to:</Trans>
              </Text>
              {candidates.length === 0 ? (
                <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
                  <Trans>
                    No other groups available. Create another group first.
                  </Trans>
                </Text>
              ) : (
                <View
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${theme.tableBorder}`,
                    overflow: 'hidden',
                  }}
                >
                  {candidates.map(g => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setTargetGroupId(g.id);
                        setError(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        border: 'none',
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        background:
                          targetGroupId === g.id
                            ? theme.buttonNormalSelectedBackground ??
                              theme.tableBackground
                            : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 13,
                        color: theme.pageText,
                      }}
                    >
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          border: `2px solid ${targetGroupId === g.id ? theme.buttonNormalText ?? theme.pageText : theme.tableBorder}`,
                          backgroundColor:
                            targetGroupId === g.id
                              ? theme.buttonNormalText ?? theme.pageText
                              : 'transparent',
                          flexShrink: 0,
                        }}
                      />
                      {g.name}
                    </button>
                  ))}
                </View>
              )}
            </View>

            {error === 'required' && (
              <Text style={{ color: theme.errorText, fontSize: 13, marginBottom: 8 }}>
                <Trans>Please select a group.</Trans>
              </Text>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="normal" onPress={() => state.close()}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="primary"
                isDisabled={working || candidates.length === 0}
                onPress={() => handleDissolve(state.close)}
              >
                <Trans>Move & remove grouping</Trans>
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
