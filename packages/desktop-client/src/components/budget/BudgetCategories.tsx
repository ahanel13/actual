import React, { memo, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
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

import { IncomeTotalsMonth } from './envelope/EnvelopeBudgetComponents';
import { ExpenseCategory } from './ExpenseCategory';
import { ExpenseGroup } from './ExpenseGroup';
import { IncomeCategory } from './IncomeCategory';
import { IncomeGroup } from './IncomeGroup';
import { RenderMonths } from './RenderMonths';
import { SidebarCategory } from './SidebarCategory';
import { SidebarGroup } from './SidebarGroup';
import { separateGroups } from './util';

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
  | { type: 'income-group'; value: CategoryGroupEntity }
  | { type: 'income-category'; value: CategoryEntity }
  | { type: 'income-total'; value: CategoryGroupEntity }
  | { type: 'income-header' }
  | { type: 'savings-separator' }
  | { type: 'savings-group'; value: CategoryGroupEntity }
  | { type: 'savings-category'; value: CategoryEntity; group: CategoryGroupEntity };

type LocalDragState =
  | DragState<CategoryEntity>
  | DragState<CategoryGroupEntity>
  | null;

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
    function onCollapse(value: Array<CategoryGroupEntity['id']>) {
      setCollapsedGroupIdsPref(value);
    }

    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [newCategoryForGroup, setNewCategoryForGroup] = useState<
      string | null
    >(null);
    const items: BudgetItem[] = useMemo(() => {
      const [expenseGroups, savingsGroups, incomeGroup] = separateGroups(categoryGroups);

      // Build income items first (Monarch layout: income at top)
      let items: BudgetItem[] = [];

      if (incomeGroup) {
        items.push({ type: 'income-header' });
        items.push({ type: 'income-group', value: incomeGroup });

        if (newCategoryForGroup === incomeGroup.id) {
          items.push({ type: 'new-category' });
        }

        items.push(
          ...(collapsedGroupIds.includes(incomeGroup.id)
            ? []
            : incomeGroup.categories?.filter(
                cat => showHiddenCategories || !cat.hidden,
              ) || []
          ).map(
            (cat): BudgetItem => ({
              type: 'income-category',
              value: cat,
            }),
          ),
        );

        // Total income summary row, then separator before expenses
        items.push({ type: 'income-total', value: incomeGroup });
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

          const groupItems: BudgetItem[] = [
            { type: 'expense-group', value: { ...group } },
          ];

          if (newCategoryForGroup === group.id) {
            groupItems.push({ type: 'new-category' });
          }

          return [
            ...groupItems,
            ...(collapsedGroupIds.includes(group.id)
              ? []
              : groupCategories || []
            ).map(
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

      // Savings & Investments section
      if (savingsGroups.length > 0) {
        items.push({ type: 'savings-separator' });

        const savingsItems: BudgetItem[] = Array.prototype.concat.apply(
          [],
          savingsGroups.map(group => {
            if (group.hidden && !showHiddenCategories) return [];

            const groupCategories = group.categories?.filter(
              cat => showHiddenCategories || !cat.hidden,
            );
            const groupItems: BudgetItem[] = [
              { type: 'savings-group', value: { ...group } },
            ];
            if (newCategoryForGroup === group.id) {
              groupItems.push({ type: 'new-category' });
            }
            return [
              ...groupItems,
              ...(collapsedGroupIds.includes(group.id)
                ? []
                : groupCategories || []
              ).map((cat): BudgetItem => ({
                type: 'savings-category',
                value: cat,
                group,
              })),
            ];
          }),
        );
        items = items.concat(savingsItems);
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

    return (
      <View
        style={{
          marginBottom: 10,
          backgroundColor: theme.budgetCurrentMonth,
          overflow: 'hidden',
          boxShadow: styles.cardShadow,
          borderRadius: '0 0 12px 12px',
          flex: 1,
        }}
      >
        {items.map((item, idx) => {
          let content;
          switch (item.type) {
            case 'new-group':
              content = (
                <Row
                  style={{ backgroundColor: theme.budgetHeaderCurrentMonth }}
                >
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
              );
              break;
            case 'income-header':
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
                    <Trans>Income</Trans>
                  </View>
                </View>
              );
              break;
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
                    marginTop: 8,
                    borderTop: '1px solid ' + theme.tableBorder,
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
            case 'income-group':
              content = (
                <IncomeGroup
                  group={item.value}
                  editingCell={editingCell}
                  collapsed={collapsedGroupIds.includes(item.value.id)}
                  onEditName={onEditName!}
                  onSave={_onSaveGroup}
                  onDelete={onDeleteGroup}
                  onToggleCollapse={onToggleCollapse}
                  onShowNewCategory={onShowNewCategory!}
                />
              );
              break;
            case 'income-category':
              content = (
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
              );
              break;
            case 'savings-separator':
              content = (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 44,
                    paddingLeft: 10,
                    paddingRight: 10,
                    marginTop: 8,
                    borderTop: '1px solid ' + theme.tableBorder,
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
                    <Trans>Savings &amp; Investments</Trans>
                  </View>
                </View>
              );
              break;
            case 'savings-group':
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
            case 'savings-category':
              content = (
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
              );
              break;
            default:
              // @ts-expect-error Error is expected here because "item.type" is "never"
              throw new Error('Unknown item type: ' + item.type);
          }

          const pos =
            idx === 0 ? 'first' : idx === items.length - 1 ? 'last' : null;

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
        })}
      </View>
    );
  },
);

BudgetCategories.displayName = 'BudgetCategories';
