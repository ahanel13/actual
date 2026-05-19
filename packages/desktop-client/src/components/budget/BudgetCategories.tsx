import React, { memo, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgExpandArrow } from '@actual-app/components/icons/v0';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { DropHighlightPosContext } from '#components/sort';
import type { DragState, OnDropCallback } from '#components/sort';
import { Row } from '#components/table';
import { useLocalPref } from '#hooks/useLocalPref';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { envelopeBudget } from '#spreadsheet/bindings';

import {
  IncomeTotalsMonth,
  useEnvelopeSheetValue,
} from './envelope/EnvelopeBudgetComponents';
import { ExpenseCategory } from './ExpenseCategory';
import { ExpenseGroup } from './ExpenseGroup';
import { IncomeCategory } from './IncomeCategory';
import { RenderMonths } from './RenderMonths';
import { SidebarCategory } from './SidebarCategory';
import { SidebarGroup } from './SidebarGroup';
import { separateGroups } from './util';

// Synthetic IDs used to persist collapse state for the Income and Savings
// section banners (which aren't real category groups). They piggy-back on
// the existing `budget.collapsed` local pref.
const INCOME_SECTION_ID = '__income_section__';
const SAVINGS_SECTION_ID = '__savings_section__';

// Wraps a category row and short-circuits to `null` when the user has the
// "hide unbudgeted categories" toggle on AND the category has 0 budgeted +
// 0 spent for the current month. Envelope budget only — tracking budget is
// a no-op (bindings differ; tracked separately).
function MaybeHideUnbudgeted({
  catId,
  hideUnbudgeted,
  enabled,
  children,
}: {
  catId: string;
  hideUnbudgeted: boolean;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const budgeted = (useEnvelopeSheetValue(envelopeBudget.catBudgeted(catId)) ??
    0) as number;
  const spent = (useEnvelopeSheetValue(envelopeBudget.catSumAmount(catId)) ??
    0) as number;
  if (enabled && hideUnbudgeted && budgeted === 0 && spent === 0) {
    return null;
  }
  return <>{children}</>;
}

type BudgetItem =
  | { type: 'new-group' }
  | { type: 'new-category' }
  | { type: 'expense-group'; value: CategoryGroupEntity }
  | {
      type: 'expense-category';
      value: CategoryEntity;
      group: CategoryGroupEntity;
    }
  | { type: 'income-separator' }
  | { type: 'income-category'; value: CategoryEntity }
  | { type: 'income-total'; value: CategoryGroupEntity }
  | { type: 'income-header' }
  | { type: 'savings-separator' }
  | {
      type: 'savings-category';
      value: CategoryEntity;
      group: CategoryGroupEntity;
    }
  | { type: 'ungrouped-divider'; value: CategoryGroupEntity };

type LocalDragState =
  | DragState<CategoryEntity>
  | DragState<CategoryGroupEntity>
  | null;

function UngroupedDivider({
  group,
  onSave,
  onDelete,
}: {
  group: CategoryGroupEntity;
  onSave: (group: CategoryGroupEntity) => void;
  onDelete: (id: CategoryGroupEntity['id']) => void;
}) {
  return (
    <View
      style={{
        height: 6,
        // make the row hover-able as a control surface
        ':hover': {
          height: 28,
          backgroundColor: theme.tableHeaderBackground,
        },
        position: 'relative',
        overflow: 'visible',
        transition: 'height 0.1s',
      }}
    >
      {/* The SidebarGroup popover handles the menu, but we need a way to
          reach it. Render an inline minimal SidebarGroup just for the menu. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          flexDirection: 'row',
          alignItems: 'center',
          opacity: 0,
          ':hover': { opacity: 1 },
        }}
      >
        <View style={{ flex: '0 0 200px', paddingLeft: 10 }}>
          <SidebarGroup
            group={group}
            collapsed={false}
            onEdit={() => {}}
            onSave={onSave}
            onDelete={onDelete}
            onToggleCollapse={() => {}}
            onShowNewCategory={() => {}}
          />
        </View>
      </View>
    </View>
  );
}

function IncomeTotalRow({ group }: { group: CategoryGroupEntity }) {
  const { t } = useTranslation();
  return (
    <Row
      style={{
        borderTop: '1px solid ' + theme.tableBorderSeparator,
        backgroundColor: theme.budgetCurrentMonth,
      }}
    >
      <View
        style={{
          paddingLeft: 14,
          fontWeight: 700,
          fontSize: 12,
          color: theme.pageText,
          justifyContent: 'center',
          flex: '0 0 200px',
        }}
      >
        {t('Total Income')}
      </View>
      <RenderMonths>
        {({ month }) => <IncomeTotalsMonth month={month} group={group} />}
      </RenderMonths>
    </Row>
  );
}

type BudgetCategoriesProps = {
  categoryGroups: CategoryGroupEntity[];
  editingCell: { id: string; cell: string } | null;
  onBudgetAction: (month: string, action: string, arg: unknown) => void;
  onShowActivity: (id: CategoryEntity['id'], month?: string) => void;
  onEditName: (id: CategoryEntity['id']) => void;
  onEditMonth: (id: CategoryEntity['id'], month: string) => void;
  onSaveCategory: (category: CategoryEntity) => void;
  onSaveGroup: (group: CategoryGroupEntity) => void;
  onDeleteCategory: (id: CategoryEntity['id']) => void;
  onDeleteGroup: (id: CategoryGroupEntity['id']) => void;
  onApplyBudgetTemplatesInGroup: (categoryIds: CategoryEntity['id'][]) => void;
  onReorderCategory: OnDropCallback;
  onReorderGroup: OnDropCallback;
};

export const BudgetCategories = memo<BudgetCategoriesProps>(
  ({
    categoryGroups,
    editingCell,
    onBudgetAction,
    onShowActivity,
    onEditName,
    onEditMonth,
    onSaveCategory,
    onSaveGroup,
    onDeleteCategory,
    onDeleteGroup,
    onApplyBudgetTemplatesInGroup,
    onReorderCategory,
    onReorderGroup,
  }) => {
    const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
      useLocalPref('budget.collapsed');
    const [showHiddenCategories] = useLocalPref('budget.showHiddenCategories');
    const [hideUnbudgeted] = useLocalPref('budget.hideUnbudgeted');
    const [budgetType = 'envelope'] = useSyncedPref('budgetType');
    const hideUnbudgetedEnabled = budgetType === 'envelope';
    function onCollapse(value: Array<CategoryGroupEntity['id']>) {
      setCollapsedGroupIdsPref(value);
    }

    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [newCategoryForGroup, setNewCategoryForGroup] = useState<
      string | null
    >(null);
    const items: BudgetItem[] = useMemo(() => {
      const [expenseGroups, savingsGroups, incomeGroup] =
        separateGroups(categoryGroups);

      // Build income items first (Monarch layout: income at top)
      let items: BudgetItem[] = [];

      if (incomeGroup) {
        // Flat layout (Monarch parity): no per-group header for Income.
        items.push({ type: 'income-header' });

        const incomeCollapsed = collapsedGroupIds.includes(INCOME_SECTION_ID);

        if (!incomeCollapsed) {
          if (newCategoryForGroup === incomeGroup.id) {
            items.push({ type: 'new-category' });
          }

          items.push(
            ...(
              incomeGroup.categories?.filter(
                cat => showHiddenCategories || !cat.hidden,
              ) || []
            ).map(
              (cat): BudgetItem => ({
                type: 'income-category',
                value: cat,
              }),
            ),
          );

          items.push({ type: 'income-total', value: incomeGroup });
        }

        items.push({ type: 'income-separator' });
      }

      // Then expense groups
      const expenseItems: BudgetItem[] = Array.prototype.concat.apply(
        [],
        expenseGroups.map(group => {
          if (group.hidden && !showHiddenCategories) {
            return [];
          }

          const groupCategories = group.categories?.filter(
            cat => showHiddenCategories || !cat.hidden,
          );

          const groupItems: BudgetItem[] = group.is_ungrouped
            ? [{ type: 'ungrouped-divider', value: { ...group } }]
            : [{ type: 'expense-group', value: { ...group } }];

          if (newCategoryForGroup === group.id) {
            groupItems.push({ type: 'new-category' });
          }

          const showCategories =
            group.is_ungrouped || !collapsedGroupIds.includes(group.id);

          return [
            ...groupItems,
            ...(showCategories ? groupCategories || [] : []).map(
              (cat): BudgetItem => ({
                type: 'expense-category',
                value: cat,
                group,
              }),
            ),
          ];
        }),
      );

      items = items.concat(expenseItems);

      // Savings & Investments section — flat layout (Monarch parity):
      // categories from all savings groups are merged into one list with no
      // per-group headers. New categories land in the first non-hidden
      // savings group (the only ambiguous case; rarely more than one).
      if (savingsGroups.length > 0) {
        items.push({ type: 'savings-separator' });

        const savingsCollapsed = collapsedGroupIds.includes(SAVINGS_SECTION_ID);

        if (!savingsCollapsed) {
          const visibleSavingsGroups = savingsGroups.filter(
            g => showHiddenCategories || !g.hidden,
          );
          const newCategoryParent = visibleSavingsGroups.find(
            g => g.id === newCategoryForGroup,
          );
          if (newCategoryParent) {
            items.push({ type: 'new-category' });
          }

          for (const group of visibleSavingsGroups) {
            const groupCategories =
              group.categories?.filter(
                cat => showHiddenCategories || !cat.hidden,
              ) || [];
            for (const cat of groupCategories) {
              items.push({ type: 'savings-category', value: cat, group });
            }
          }
        }
      }

      if (isAddingGroup) {
        items.push({ type: 'new-group' });
      }

      return items;
    }, [
      categoryGroups,
      collapsedGroupIds,
      newCategoryForGroup,
      isAddingGroup,
      showHiddenCategories,
    ]);

    const [dragState, setDragState] = useState<LocalDragState>(null);
    const [savedCollapsed, setSavedCollapsed] = useState<Array<
      CategoryGroupEntity['id']
    > | null>(null);

    // TODO: If we turn this into a reducer, we could probably memoize
    // each item in the list for better perf
    function onDragChange(
      newDragState: DragState<CategoryEntity> | DragState<CategoryGroupEntity>,
    ) {
      const { state } = newDragState;

      if (state === 'start-preview') {
        // @ts-expect-error fix me
        setDragState({
          type: newDragState.type,
          item: newDragState.item,
          preview: true,
        });
      } else if (state === 'start') {
        if (dragState) {
          setDragState({
            ...dragState,
            preview: false,
          });
          setSavedCollapsed(collapsedGroupIds);
        }
      } else if (state === 'end') {
        setDragState(null);
        onCollapse(savedCollapsed || []);
      }
    }

    function onToggleCollapse(id: CategoryGroupEntity['id']) {
      if (collapsedGroupIds.includes(id)) {
        onCollapse(collapsedGroupIds.filter(id_ => id_ !== id));
      } else {
        onCollapse([...collapsedGroupIds, id]);
      }
    }

    function onShowNewGroup() {
      setIsAddingGroup(true);
    }

    function onHideNewGroup() {
      setIsAddingGroup(false);
    }

    function _onSaveGroup(group: CategoryGroupEntity) {
      onSaveGroup?.(group);
      if (group.id === 'new') {
        onHideNewGroup();
      }
    }

    function onShowNewCategory(groupId: CategoryGroupEntity['id']) {
      onCollapse(collapsedGroupIds.filter(c => c !== groupId));
      setNewCategoryForGroup(groupId);
    }

    function onHideNewCategory() {
      setNewCategoryForGroup(null);
    }

    function _onSaveCategory(category: CategoryEntity) {
      onSaveCategory?.(category);
      if (category.id === 'new') {
        onHideNewCategory();
      }
    }

    // Partition items into 3 visually-separate cards (Income / Expenses /
    // Savings). The income-separator marker switches to expense; the
    // savings-separator marker switches to savings. Both separators are
    // rendered AS the banner of the section they belong to (Expenses /
    // Savings & Investments), so they push into the new section.
    const sectionedItems: Record<
      'income' | 'expense' | 'savings',
      BudgetItem[]
    > = {
      income: [],
      expense: [],
      savings: [],
    };
    {
      let current: 'income' | 'expense' | 'savings' = 'income';
      for (const item of items) {
        if (item.type === 'income-separator') current = 'expense';
        if (item.type === 'savings-separator') current = 'savings';
        sectionedItems[current].push(item);
      }
    }

    const renderItem =
      (sectionItems: BudgetItem[]) => (item: BudgetItem, idx: number) => {
        let content;
        switch (item.type) {
          case 'new-group':
            content = (
              <Row style={{ backgroundColor: theme.budgetHeaderCurrentMonth }}>
                <SidebarGroup
                  group={{ id: 'new', name: '' }}
                  collapsed={false}
                  editing
                  onSave={_onSaveGroup}
                  onHideNewGroup={onHideNewGroup}
                  onEdit={onEditName}
                />
              </Row>
            );
            break;
          case 'new-category':
            content = (
              <Row>
                <SidebarCategory
                  innerRef={null}
                  category={{
                    name: '',
                    group: newCategoryForGroup!,
                    is_income:
                      newCategoryForGroup ===
                      categoryGroups.find(g => g.is_income)?.id,
                    id: 'new',
                  }}
                  editing
                  onSave={_onSaveCategory}
                  onHideNewCategory={onHideNewCategory}
                  onEditName={onEditName!}
                />
              </Row>
            );
            break;

          case 'expense-group':
            content = (
              <ExpenseGroup
                group={item.value}
                editingCell={editingCell}
                collapsed={collapsedGroupIds.includes(item.value.id)}
                dragState={dragState}
                onEditName={onEditName}
                onSave={_onSaveGroup}
                onDelete={onDeleteGroup}
                onDragChange={onDragChange}
                onReorderGroup={onReorderGroup}
                onReorderCategory={onReorderCategory}
                onToggleCollapse={onToggleCollapse}
                onShowNewCategory={onShowNewCategory}
                onApplyBudgetTemplatesInGroup={onApplyBudgetTemplatesInGroup}
              />
            );
            break;
          case 'expense-category':
            content = (
              <MaybeHideUnbudgeted
                catId={item.value.id}
                hideUnbudgeted={!!hideUnbudgeted}
                enabled={hideUnbudgetedEnabled}
              >
                <ExpenseCategory
                  cat={item.value}
                  categoryGroup={item.group}
                  editingCell={editingCell}
                  dragState={dragState}
                  onEditName={onEditName}
                  onEditMonth={onEditMonth}
                  onSave={_onSaveCategory}
                  onDelete={onDeleteCategory}
                  onDragChange={onDragChange}
                  onReorder={onReorderCategory}
                  onBudgetAction={onBudgetAction}
                  onShowActivity={onShowActivity}
                />
              </MaybeHideUnbudgeted>
            );
            break;
          case 'income-header': {
            const incomeCollapsed =
              collapsedGroupIds.includes(INCOME_SECTION_ID);
            content = (
              <View
                role="button"
                tabIndex={0}
                onClick={() => onToggleCollapse(INCOME_SECTION_ID)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse(INCOME_SECTION_ID);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 44,
                  paddingLeft: 10,
                  paddingRight: 10,
                  backgroundColor: theme.tableHeaderBackground,
                  cursor: 'pointer',
                }}
              >
                <SvgExpandArrow
                  width={8}
                  height={8}
                  style={{
                    marginRight: 8,
                    marginLeft: 4,
                    flexShrink: 0,
                    transition: 'transform .1s',
                    transform: incomeCollapsed ? 'rotate(-90deg)' : '',
                    color: theme.tableHeaderText,
                  }}
                />
                <View
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: theme.tableHeaderText,
                    textTransform: 'uppercase',
                    flex: 1,
                  }}
                >
                  <Trans>Income</Trans>
                </View>
              </View>
            );
            break;
          }
          case 'income-total':
            content = <IncomeTotalRow group={item.value} />;
            break;
          case 'income-separator':
            content = (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 44,
                  paddingLeft: 10,
                  paddingRight: 10,
                  backgroundColor: theme.tableHeaderBackground,
                }}
              >
                <View
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: theme.tableHeaderText,
                    textTransform: 'uppercase',
                    flex: 1,
                  }}
                >
                  <Trans>Expenses</Trans>
                </View>
                <Button
                  variant="bare"
                  onPress={onShowNewGroup}
                  style={{
                    fontSize: 12,
                    color: theme.pageTextLight,
                    padding: '3px 8px',
                  }}
                >
                  + <Trans>Add group</Trans>
                </Button>
              </View>
            );
            break;
          case 'income-category':
            content = (
              <MaybeHideUnbudgeted
                catId={item.value.id}
                hideUnbudgeted={!!hideUnbudgeted}
                enabled={hideUnbudgetedEnabled}
              >
                <IncomeCategory
                  cat={item.value}
                  editingCell={editingCell}
                  isLast={idx === items.length - 1}
                  onEditName={onEditName}
                  onEditMonth={onEditMonth}
                  onSave={_onSaveCategory}
                  onDelete={onDeleteCategory}
                  onDragChange={onDragChange}
                  onReorder={onReorderCategory}
                  onBudgetAction={onBudgetAction}
                  onShowActivity={onShowActivity}
                />
              </MaybeHideUnbudgeted>
            );
            break;
          case 'ungrouped-divider':
            content = (
              <UngroupedDivider
                group={item.value}
                onSave={_onSaveGroup}
                onDelete={onDeleteGroup}
              />
            );
            break;
          case 'savings-separator': {
            const savingsCollapsed =
              collapsedGroupIds.includes(SAVINGS_SECTION_ID);
            content = (
              <View
                role="button"
                tabIndex={0}
                onClick={() => onToggleCollapse(SAVINGS_SECTION_ID)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse(SAVINGS_SECTION_ID);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 44,
                  paddingLeft: 10,
                  paddingRight: 10,
                  backgroundColor: theme.tableHeaderBackground,
                  cursor: 'pointer',
                }}
              >
                <SvgExpandArrow
                  width={8}
                  height={8}
                  style={{
                    marginRight: 8,
                    marginLeft: 4,
                    flexShrink: 0,
                    transition: 'transform .1s',
                    transform: savingsCollapsed ? 'rotate(-90deg)' : '',
                    color: theme.tableHeaderText,
                  }}
                />
                <View
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: theme.tableHeaderText,
                    textTransform: 'uppercase',
                    flex: 1,
                  }}
                >
                  <Trans>Savings &amp; Investments</Trans>
                </View>
              </View>
            );
            break;
          }
          case 'savings-category':
            content = (
              <MaybeHideUnbudgeted
                catId={item.value.id}
                hideUnbudgeted={!!hideUnbudgeted}
                enabled={hideUnbudgetedEnabled}
              >
                <ExpenseCategory
                  cat={item.value}
                  categoryGroup={item.group}
                  editingCell={editingCell}
                  dragState={dragState}
                  onEditName={onEditName}
                  onEditMonth={onEditMonth}
                  onSave={_onSaveCategory}
                  onDelete={onDeleteCategory}
                  onDragChange={onDragChange}
                  onReorder={onReorderCategory}
                  onBudgetAction={onBudgetAction}
                  onShowActivity={onShowActivity}
                />
              </MaybeHideUnbudgeted>
            );
            break;
          default:
            // @ts-expect-error Error is expected here because "item.type" is "never"
            throw new Error('Unknown item type: ' + item.type);
        }

        const pos =
          idx === 0 ? 'first' : idx === sectionItems.length - 1 ? 'last' : null;

        return (
          <DropHighlightPosContext.Provider
            key={
              'value' in item
                ? item.value.id
                : item.type === 'income-header'
                  ? 'income-header'
                  : item.type === 'income-separator'
                    ? 'income-separator'
                    : item.type === 'savings-separator'
                      ? 'savings-separator'
                      : idx
            }
            value={pos}
          >
            <View
              style={
                dragState
                  ? {}
                  : {
                      ':hover': { backgroundColor: theme.budgetCurrentMonth },
                      ...(item.type === 'expense-group' &&
                        idx !== 0 && { marginTop: 8 }),
                    }
              }
            >
              {content}
            </View>
          </DropHighlightPosContext.Provider>
        );
      };

    const cardStyle = {
      backgroundColor: theme.budgetCurrentMonth,
      overflow: 'hidden' as const,
      boxShadow: styles.cardShadow,
      borderRadius: 12,
    };

    return (
      <View style={{ flex: 1 }}>
        {sectionedItems.income.length > 0 && (
          <View style={{ ...cardStyle, marginBottom: 16 }}>
            {sectionedItems.income.map(renderItem(sectionedItems.income))}
          </View>
        )}
        {sectionedItems.expense.length > 0 && (
          <View style={{ ...cardStyle, marginBottom: 16 }}>
            {sectionedItems.expense.map(renderItem(sectionedItems.expense))}
          </View>
        )}
        {sectionedItems.savings.length > 0 && (
          <View style={{ ...cardStyle, marginBottom: 16 }}>
            {sectionedItems.savings.map(renderItem(sectionedItems.savings))}
          </View>
        )}
      </View>
    );
  },
);

BudgetCategories.displayName = 'BudgetCategories';
