import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgDotsHorizontalTriple } from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { BudgetMonthMenu } from '#components/budget/envelope/budgetsummary/BudgetMonthMenu';
import { ToBudget } from '#components/budget/envelope/budgetsummary/ToBudget';
import { TotalsList } from '#components/budget/envelope/budgetsummary/TotalsList';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { useUndo } from '#hooks/useUndo';
import { envelopeBudget } from '#spreadsheet/bindings';

type GroupCardProps = {
  group: CategoryGroupEntity;
};

function GroupCard({ group }: GroupCardProps) {
  const format = useFormat();
  const budgeted =
    useEnvelopeSheetValue(envelopeBudget.groupBudgeted(group.id)) ?? 0;
  const spent = Math.abs(
    useEnvelopeSheetValue(envelopeBudget.groupSumAmount(group.id)) ?? 0,
  );
  const balance =
    useEnvelopeSheetValue(envelopeBudget.groupBalance(group.id)) ?? 0;

  if (budgeted === 0 && spent === 0) return null;

  const absBudgeted = Math.abs(budgeted);
  const pct = absBudgeted !== 0 ? Math.min(spent / absBudgeted, 1) : 0;
  const isOver = absBudgeted !== 0 && spent > absBudgeted;

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
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <View
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.pageText,
            flexShrink: 1,
            marginRight: 8,
          }}
        >
          {group.name}
        </View>
        <PrivacyFilter>
          <View
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isOver ? theme.numberNegative : theme.numberPositive,
              flexShrink: 0,
            }}
          >
            <FinancialText>{format(balance, 'financial')}</FinancialText>
          </View>
        </PrivacyFilter>
      </View>

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

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <PrivacyFilter>
          <View style={{ fontSize: 12, color: theme.pageTextLight }}>
            <FinancialText>{format(spent, 'financial')}</FinancialText>
            {' spent'}
          </View>
        </PrivacyFilter>
        <PrivacyFilter>
          <View style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            <FinancialText>{format(absBudgeted, 'financial')}</FinancialText>
            {' budget'}
          </View>
        </PrivacyFilter>
      </View>
    </View>
  );
}

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
  const menuTriggerRef = useRef(null);

  const prevMonthName = monthUtils.format(
    monthUtils.prevMonth(month),
    'MMM',
    locale,
  );
  const displayMonth = monthUtils.format(month, "MMMM ''yy", locale);

  const expenseGroups = categoryGroups.filter(
    g => g.type !== 'income' && !g.hidden,
  );

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
      {/* Left to budget / ToBudget card */}
      <View
        style={{
          backgroundColor: theme.cardBackground,
          borderRadius: 12,
          padding: '16px 20px 20px',
          marginBottom: 12,
          boxShadow: '0px 1px 2px rgba(34,32,29,0.08)',
          flexShrink: 0,
        }}
      >
        {/* Card header: title + menu button */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <View style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
            {t('Summary')}
          </View>
          <Button
            ref={menuTriggerRef}
            variant="bare"
            aria-label={t('Month actions')}
            onPress={() => setMenuOpen(true)}
            style={{ padding: 4, color: theme.pageTextLight }}
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

        {/* Interactive ToBudget amount */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <ToBudget
            month={month}
            prevMonthName={prevMonthName}
            onBudgetAction={onBudgetAction}
          />
        </View>

        {/* Totals breakdown */}
        <View
          style={{
            borderTop: '1px solid ' + theme.tableBorder,
            paddingTop: 12,
          }}
        >
          <TotalsList prevMonthName={prevMonthName} />
        </View>
      </View>

      {/* Per-group expense cards */}
      {expenseGroups.map(group => (
        <GroupCard key={group.id} group={group} />
      ))}
    </View>
  );
}
