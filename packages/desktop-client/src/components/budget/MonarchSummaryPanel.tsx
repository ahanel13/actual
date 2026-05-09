import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import {
  useEnvelopeSheetValue,
} from '#components/budget/envelope/EnvelopeBudgetComponents';
import { useFormat } from '#hooks/useFormat';
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

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
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
};

export function MonarchSummaryPanel({
  month,
  categoryGroups,
}: MonarchSummaryPanelProps) {
  const { t } = useTranslation();
  const format = useFormat();

  const toBudget =
    (useEnvelopeSheetValue({
      name: envelopeBudget.toBudget,
      value: 0,
    }) as number) ?? 0;

  const isNegative = toBudget < 0;

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
      <View
        style={{
          backgroundColor: theme.cardBackground,
          borderRadius: 12,
          padding: 20,
          marginBottom: 12,
          alignItems: 'center',
          boxShadow: '0px 1px 2px rgba(34,32,29,0.08)',
          flexShrink: 0,
        }}
      >
        <PrivacyFilter style={{ textAlign: 'center' }}>
          <View
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: isNegative ? theme.numberNegative : theme.numberPositive,
              marginBottom: 4,
            }}
          >
            <FinancialText>{format(Math.abs(toBudget), 'financial')}</FinancialText>
          </View>
        </PrivacyFilter>
        <View
          style={{
            fontSize: 13,
            color: theme.pageTextLight,
          }}
        >
          {isNegative ? t('Overbudgeted') : t('Left to budget')}
        </View>
      </View>

      {expenseGroups.map(group => (
        <GroupCard key={group.id} group={group} />
      ))}
    </View>
  );
}
