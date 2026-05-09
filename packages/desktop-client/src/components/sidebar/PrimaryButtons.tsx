import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  SvgCog,
  SvgCreditCard,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { useIsTestEnv } from '#hooks/useIsTestEnv';
import { useSyncServerStatus } from '#hooks/useSyncServerStatus';

import { Item } from './Item';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const syncServerStatus = useSyncServerStatus();
  const isTestEnv = useIsTestEnv();
  const isUsingServer = syncServerStatus !== 'no-server' || isTestEnv;

  return (
    <View style={{ flexShrink: 0 }}>
      <Item title={t('Budget')} Icon={SvgWallet} to="/budget" />
      <Item title={t('Reports')} Icon={SvgReports} to="/reports" />
      <Item title={t('Schedules')} Icon={SvgCalendar3} to="/schedules" />
      <Item title={t('Payees')} Icon={SvgStoreFront} to="/payees" />
      <Item title={t('Rules')} Icon={SvgTuning} to="/rules" />
      {isUsingServer && (
        <Item title={t('Bank Sync')} Icon={SvgCreditCard} to="/bank-sync" />
      )}
      <Item title={t('Tags')} Icon={SvgTag} to="/tags" />
      <Item title={t('Settings')} Icon={SvgCog} to="/settings" />
    </View>
  );
}
