import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgAdd } from '@actual-app/components/icons/v0';
import { SvgDelete } from '@actual-app/components/icons/v0';
import { SvgArrowsSynchronize } from '@actual-app/components/icons/v2';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import {
  useCreateCategoryGroupMutation,
  useCreateCategoryMutation,
  useDeleteCategoryGroupMutation,
  useDeleteCategoryMutation,
  useSaveCategoryGroupMutation,
  useSaveCategoryMutation,
} from '#budget';
import { useCategories } from '#hooks/useCategories';

import { Setting } from './UI';

type NewCategoryDraft = { groupId: string; name: string } | null;

function InlineRenameRow({
  initialName,
  placeholder,
  onSave,
  onDelete,
  indent = 0,
  emphasis = false,
}: {
  initialName: string;
  placeholder?: string;
  onSave: (name: string) => void;
  onDelete?: () => void;
  indent?: number;
  emphasis?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const { t } = useTranslation();

  if (editing) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: indent,
        }}
      >
        <Input
          value={value}
          placeholder={placeholder}
          onChangeValue={setValue}
          onEnter={() => {
            const trimmed = value.trim();
            if (trimmed) {
              onSave(trimmed);
            }
            setEditing(false);
          }}
          onEscape={() => {
            setValue(initialName);
            setEditing(false);
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          onPress={() => {
            const trimmed = value.trim();
            if (trimmed) {
              onSave(trimmed);
            }
            setEditing(false);
          }}
        >
          <Trans>Save</Trans>
        </Button>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: indent,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      <View
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
        style={{
          flex: 1,
          cursor: 'pointer',
          fontWeight: emphasis ? 600 : 400,
          color: theme.pageText,
        }}
      >
        <Text>{initialName || placeholder || ''}</Text>
      </View>
      {onDelete && (
        <Button
          variant="bare"
          aria-label={t('Delete')}
          onPress={onDelete}
          style={{ padding: 4 }}
        >
          <SvgDelete width={12} height={12} />
        </Button>
      )}
    </View>
  );
}

export function Categories() {
  const { t } = useTranslation();
  const { data: { grouped: groups } = { grouped: [] } } = useCategories();

  const createCategory = useCreateCategoryMutation();
  const saveCategory = useSaveCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();
  const createGroup = useCreateCategoryGroupMutation();
  const saveGroup = useSaveCategoryGroupMutation();
  const deleteGroup = useDeleteCategoryGroupMutation();

  const [newCategoryDraft, setNewCategoryDraft] =
    useState<NewCategoryDraft>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const renderCategory = (
    group: CategoryGroupEntity,
    category: CategoryEntity,
  ) => (
    <InlineRenameRow
      key={category.id}
      initialName={category.name}
      indent={20}
      onSave={name => {
        if (name === category.name) return;
        saveCategory.mutate({ category: { ...category, name } });
      }}
      onDelete={() => deleteCategory.mutate({ id: category.id })}
    />
  );

  const renderGroup = (group: CategoryGroupEntity) => {
    const isTransferGroup = !!group.is_transfer;
    return (
      <View key={group.id} style={{ marginTop: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <View style={{ flex: 1 }}>
            <InlineRenameRow
              initialName={group.name}
              emphasis
              onSave={name => {
                if (name === group.name) return;
                const { categories: _categories, ...rest } = group;
                saveGroup.mutate({
                  group: { ...rest, name } as CategoryGroupEntity,
                });
              }}
              onDelete={
                group.is_income
                  ? undefined
                  : () => deleteGroup.mutate({ id: group.id })
              }
            />
          </View>
          {!group.is_income && (
            <Button
              variant="bare"
              onPress={() => {
                const { categories: _categories, ...rest } = group;
                saveGroup.mutate({
                  group: {
                    ...rest,
                    is_transfer: !isTransferGroup,
                  } as CategoryGroupEntity,
                });
              }}
              style={{
                padding: '3px 6px',
                fontSize: 11,
                color: isTransferGroup
                  ? theme.noticeTextLight
                  : theme.pageTextLight,
                borderRadius: 4,
                border: `1px solid ${isTransferGroup ? theme.noticeTextLight : theme.tableBorder}`,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <SvgArrowsSynchronize width={10} height={10} />
              {isTransferGroup ? (
                <Trans>Transfers</Trans>
              ) : (
                <Trans>Set as Transfers</Trans>
              )}
            </Button>
          )}
        </View>

        {group.categories?.map(c => renderCategory(group, c))}

        {newCategoryDraft?.groupId === group.id ? (
          <View style={{ paddingLeft: 20, marginTop: 4 }}>
            <InlineRenameRow
              initialName=""
              placeholder={t('New category name')}
              onSave={name => {
                createCategory.mutate({
                  name,
                  groupId: group.id,
                  isIncome: !!group.is_income,
                  isHidden: false,
                });
                setNewCategoryDraft(null);
              }}
            />
          </View>
        ) : (
          <View style={{ paddingLeft: 20, marginTop: 2 }}>
            <Button
              variant="bare"
              onPress={() =>
                setNewCategoryDraft({ groupId: group.id, name: '' })
              }
              style={{
                fontSize: 12,
                color: theme.pageTextLight,
                padding: '2px 4px',
              }}
            >
              <SvgAdd
                width={9}
                height={9}
                style={{ marginRight: 4, display: 'inline-block' }}
              />
              <Trans>Add category</Trans>
            </Button>
          </View>
        )}
      </View>
    );
  };

  const visibleGroups = groups.filter(g => !g.hidden);
  const regularGroups = visibleGroups.filter(g => !g.is_transfer);
  const transferGroups = visibleGroups.filter(g => !!g.is_transfer);

  return (
    <Setting
      primaryAction={
        showNewGroup ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <InlineRenameRow
              initialName=""
              placeholder={t('New group name')}
              onSave={name => {
                createGroup.mutate({ name });
                setShowNewGroup(false);
              }}
            />
            <Button onPress={() => setShowNewGroup(false)}>
              <Trans>Cancel</Trans>
            </Button>
          </View>
        ) : (
          <Button onPress={() => setShowNewGroup(true)}>
            <Trans>Add category group</Trans>
          </Button>
        )
      }
    >
      <Text>
        <Trans>
          <strong>Categories</strong> — add, rename, and delete categories and
          their groups outside the budget view. Click a name to rename.
        </Trans>
      </Text>
      <View style={{ width: '100%', gap: 6 }}>
        {regularGroups.map(g => renderGroup(g))}
      </View>

      {transferGroups.length > 0 && (
        <View style={{ width: '100%', marginTop: 16, gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingBottom: 4,
              borderBottom: `1px solid ${theme.tableBorder}`,
            }}
          >
            <SvgArrowsSynchronize
              width={12}
              height={12}
              style={{ color: theme.pageTextSubdued }}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: theme.pageTextSubdued,
                textTransform: 'uppercase',
              }}
            >
              <Trans>Transfers</Trans>
            </Text>
          </View>
          {transferGroups.map(g => renderGroup(g))}
        </View>
      )}
    </Setting>
  );
}
