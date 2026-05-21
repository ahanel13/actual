import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgDotsHorizontalTriple,
  SvgInformationOutline,
} from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { BudgetMonthMenu } from '#components/budget/envelope/budgetsummary/BudgetMonthMenu';
import { ToBudget } from '#components/budget/envelope/budgetsummary/ToBudget';
import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { useUndo } from '#hooks/useUndo';
import { envelopeBudget } from '#spreadsheet/bindings';

// Renders nothing — just reads a group's budgeted value and reports it up
function GroupBudgetReader({
  groupId,
  onValue,
}: {
  groupId: string;
  onValue: (id: string, val: number) => void;
}) {
  const value = (useEnvelopeSheetValue(envelopeBudget.groupBudgeted(groupId)) ??
    0) as number;
  useEffect(() => {
    onValue(groupId, value);
  }, [groupId, value, onValue]);
  return null;
}

type SectionCardProps = {
  label: string;
  budget: number;
  actual: number;
  remaining: number;
  invertProgress?: boolean;
};

function SectionCard({
  label,
  budget,
  actual,
  remaining,
  invertProgress = false,
}: SectionCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const absBudget = Math.abs(budget);
  const absActual = Math.abs(actual);
  const pct = absBudget > 0 ? Math.min(absActual / absBudget, 1) : 0;
  const isOver = absBudget > 0 && absActual > absBudget;
  const isRemNegative = remaining < 0;

  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        boxShadow: '0px 1px 2px rgba(34,32,29,0.08)',
        flexShrink: 0,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <View style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
          {label}
        </View>
        <PrivacyFilter>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 3,
              fontSize: 12,
              color: theme.pageTextSubdued,
            }}
          >
            <FinancialText>{format(absBudget, 'financial')}</FinancialText>
            <View>{t('budget')}</View>
          </View>
        </PrivacyFilter>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 6,
          backgroundColor: theme.tableBorder,
          borderRadius: 3,
          marginBottom: 8,
        }}
      >
        <View
          style={{
            width: `${Math.min(pct * 100, 100)}%`,
            height: '100%',
            backgroundColor: isOver
              ? theme.numberNegative
              : theme.numberPositive,
            borderRadius: 3,
          }}
        />
      </View>

      {/* Actual vs Remaining */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <PrivacyFilter>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 3,
              fontSize: 12,
              color: theme.pageTextLight,
            }}
          >
            <FinancialText>{format(absActual, 'financial')}</FinancialText>
            <View>{invertProgress ? t('earned') : t('spent')}</View>
          </View>
        </PrivacyFilter>
        <PrivacyFilter>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 3,
              fontSize: 12,
              fontWeight: 600,
              color: isRemNegative
                ? theme.numberNegative
                : theme.numberPositive,
            }}
          >
            <FinancialText>
              {format(Math.abs(remaining), 'financial')}
            </FinancialText>
            <View style={{ fontWeight: 400, color: theme.pageTextLight }}>
              {t('remaining')}
            </View>
          </View>
        </PrivacyFilter>
      </View>
    </View>
  );
}

function GroupSectionCard({ group }: { group: CategoryGroupEntity }) {
  const budget = (useEnvelopeSheetValue(
    envelopeBudget.groupBudgeted(group.id),
  ) ?? 0) as number;
  const spent = (useEnvelopeSheetValue(
    envelopeBudget.groupSumAmount(group.id),
  ) ?? 0) as number;
  const balance = (useEnvelopeSheetValue(
    envelopeBudget.groupBalance(group.id),
  ) ?? 0) as number;

  return (
    <SectionCard
      label={group.name}
      budget={-budget}
      actual={-spent}
      remaining={balance}
    />
  );
}

type TabName = 'summary' | 'income' | 'expenses' | 'savings';

type MonarchSummaryPanelProps = {
  month: string;
  categoryGroups: CategoryGroupEntity[];
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
};

export function MonarchSummaryPanel({
  month,
  categoryGroups,
  onBudgetAction,
}: MonarchSummaryPanelProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { showUndoNotification } = useUndo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('expenses');
  const menuTriggerRef = useRef(null);

  const prevMonthName = monthUtils.format(
    monthUtils.prevMonth(month),
    'MMM',
    locale,
  );
  const displayMonth = monthUtils.format(month, "MMMM ''yy", locale);

  // Aggregate income group budgets (hooks can't be called in a loop)
  const [incomeBudgets, setIncomeBudgets] = useState<Record<string, number>>(
    {},
  );
  const onGroupBudget = useCallback((id: string, val: number) => {
    setIncomeBudgets(prev =>
      prev[id] === val ? prev : { ...prev, [id]: val },
    );
  }, []);

  const incomeGroups = categoryGroups.filter(g => g.is_income && !g.hidden);
  const savingsGroups = categoryGroups.filter(g => g.is_savings && !g.hidden);
  const expenseGroups = categoryGroups.filter(
    g => !g.is_income && !g.is_savings && !g.is_transfer && !g.hidden,
  );

  const totalIncomeBudget = Object.values(incomeBudgets).reduce(
    (sum, v) => sum + v,
    0,
  );

  // Expense totals from single bindings
  const totalIncome = (useEnvelopeSheetValue(envelopeBudget.totalIncome) ??
    0) as number;
  const totalExpenseBudget = (useEnvelopeSheetValue(
    envelopeBudget.totalBudgeted,
  ) ?? 0) as number;
  const totalSpent = (useEnvelopeSheetValue(envelopeBudget.totalSpent) ??
    0) as number;
  const totalBalance = (useEnvelopeSheetValue(envelopeBudget.totalBalance) ??
    0) as number;
  const toBudget =
    (useEnvelopeSheetValue({
      name: envelopeBudget.toBudget,
      value: 0,
    }) as number) ?? 0;

  const isOverbudgeted = toBudget < 0;
  const incomeRemaining = totalIncomeBudget + totalIncome;

  const tabs: { id: TabName; label: string }[] = [
    { id: 'summary', label: t('Summary') },
    { id: 'income', label: t('Income') },
    { id: 'expenses', label: t('Expenses') },
    ...(savingsGroups.length > 0
      ? [{ id: 'savings' as TabName, label: t('Savings') }]
      : []),
  ];

  return (
    <View
      style={{
        width: 272,
        flexShrink: 0,
        marginLeft: 8,
        paddingBottom: 8,
        overflowY: 'auto',
      }}
    >
      {/* Hidden readers to aggregate income group budgets */}
      {incomeGroups.map(g => (
        <GroupBudgetReader key={g.id} groupId={g.id} onValue={onGroupBudget} />
      ))}

      {/* Left to budget / Overbudgeted card */}
      <View
        style={{
          backgroundColor: isOverbudgeted
            ? '#feebec'
            : theme.noticeBackgroundLight,
          borderRadius: 12,
          padding: '14px 16px 16px',
          marginBottom: 12,
          flexShrink: 0,
          boxShadow: '0px 1px 2px rgba(34,32,29,0.08)',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
              color: isOverbudgeted
                ? theme.errorTextDark
                : theme.noticeTextDark,
            }}
          >
            <Trans>Left to budget</Trans>
            <SvgInformationOutline
              width={13}
              height={13}
              style={{ opacity: 0.5 }}
            />
          </View>
          <Button
            ref={menuTriggerRef}
            variant="bare"
            aria-label={t('Month actions')}
            onPress={() => setMenuOpen(true)}
            style={{
              padding: 4,
              color: isOverbudgeted
                ? theme.errorTextDark
                : theme.noticeTextDark,
            }}
          >
            <SvgDotsHorizontalTriple width={15} height={15} />
          </Button>
          <Popover
            triggerRef={menuTriggerRef}
            isOpen={menuOpen}
            onOpenChange={() => setMenuOpen(false)}
            style={{ width: 220 }}
          >
            <BudgetMonthMenu
              onCopyLastMonthBudget={() => {
                onBudgetAction(month, 'copy-last');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    "{{displayMonth}} budgets have all been set to last month's budgeted amounts.",
                    { displayMonth },
                  ),
                });
              }}
              onSetBudgetsToZero={() => {
                onBudgetAction(month, 'set-zero');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budgets have all been set to zero.',
                    { displayMonth },
                  ),
                });
              }}
              onSetMonthsAverage={numberOfMonths => {
                onBudgetAction(month, `set-${numberOfMonths}-avg`);
                setMenuOpen(false);
                showUndoNotification({
                  message:
                    numberOfMonths === 12
                      ? t(
                          `${displayMonth} budgets have all been set to yearly average.`,
                        )
                      : t(
                          `${displayMonth} budgets have all been set to ${numberOfMonths} month average.`,
                        ),
                });
              }}
              onCheckTemplates={() => {
                onBudgetAction(month, 'check-templates');
                setMenuOpen(false);
              }}
              onApplyBudgetTemplates={() => {
                onBudgetAction(month, 'apply-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budget templates have been applied.',
                    { displayMonth },
                  ),
                });
              }}
              onOverwriteWithBudgetTemplates={() => {
                onBudgetAction(month, 'overwrite-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budget templates have been overwritten.',
                    { displayMonth },
                  ),
                });
              }}
              onEndOfMonthCleanup={() => {
                onBudgetAction(month, 'cleanup-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} end-of-month cleanup templates have been applied.',
                    { displayMonth },
                  ),
                });
              }}
            />
          </Popover>
        </View>

        <View style={{ alignItems: 'center' }}>
          <ToBudget
            month={month}
            prevMonthName={prevMonthName}
            onBudgetAction={onBudgetAction}
            hideLabel
            amountStyle={{
              fontSize: 36,
              fontWeight: 700,
              color: isOverbudgeted ? theme.errorText : theme.noticeTextDark,
            }}
          />
          <View
            style={{
              fontSize: 12,
              color: isOverbudgeted
                ? theme.errorTextDark
                : theme.noticeTextDark,
              opacity: 0.7,
              marginTop: 2,
            }}
          >
            {isOverbudgeted ? t('Overbudgeted') : t('Left to budget')}
          </View>
        </View>
      </View>

      {/* Tab navigation */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.cardBackground,
          borderRadius: 10,
          padding: 3,
          marginBottom: 12,
          flexShrink: 0,
          boxShadow: '0px 1px 2px rgba(34,32,29,0.08)',
        }}
      >
        {tabs.map(tab => (
          <Button
            key={tab.id}
            variant="bare"
            onPress={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: '6px 4px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color:
                activeTab === tab.id ? theme.pageText : theme.pageTextSubdued,
              backgroundColor:
                activeTab === tab.id ? theme.pageBackground : 'transparent',
              boxShadow:
                activeTab === tab.id
                  ? '0px 1px 3px rgba(34,32,29,0.12)'
                  : 'none',
            }}
          >
            {tab.label}
          </Button>
        ))}
      </View>

      {/* Tab content */}
      {/* Summary tab: overview of income, expenses, savings */}
      {activeTab === 'summary' && (
        <>
          <SectionCard
            label={t('Income')}
            budget={totalIncomeBudget}
            actual={-totalIncome}
            remaining={incomeRemaining}
            invertProgress
          />
          <SectionCard
            label={t('Expenses')}
            budget={-totalExpenseBudget}
            actual={-totalSpent}
            remaining={totalBalance}
          />
        </>
      )}

      {/* Income tab: income breakdown */}
      {activeTab === 'income' && (
        <SectionCard
          label={t('Income')}
          budget={totalIncomeBudget}
          actual={-totalIncome}
          remaining={incomeRemaining}
          invertProgress
        />
      )}

      {/* Expenses tab: regular expense groups only */}
      {activeTab === 'expenses' && (
        <>
          {expenseGroups.length > 0 ? (
            expenseGroups.map(g => <GroupSectionCard key={g.id} group={g} />)
          ) : (
            <SectionCard
              label={t('Expenses')}
              budget={-totalExpenseBudget}
              actual={-totalSpent}
              remaining={totalBalance}
            />
          )}
        </>
      )}

      {/* Savings & Investments tab */}
      {activeTab === 'savings' && (
        <>
          {savingsGroups.length > 0 ? (
            savingsGroups.map(g => <GroupSectionCard key={g.id} group={g} />)
          ) : (
            <View
              style={{ color: theme.pageTextSubdued, fontSize: 13, padding: 8 }}
            >
              {t(
                'No savings or investment groups found. Name a category group with keywords like "Savings" or "Investments" to see it here.',
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}
