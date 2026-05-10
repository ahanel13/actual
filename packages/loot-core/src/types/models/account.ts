// Asset types
export type AccountAssetType =
  | 'cash'
  | 'investment'
  | 'real_estate'
  | 'vehicle'
  | 'valuables'
  | 'other_asset';

// Liability types
export type AccountLiabilityType =
  | 'credit_card'
  | 'mortgage'
  | 'loan'
  | 'other_liability';

export type AccountType = AccountAssetType | AccountLiabilityType;

export type AccountEntity = {
  id: string;
  name: string;
  type?: AccountType | null;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number;
  last_reconciled: string | null;
  tombstone: 0 | 1;

  // Sync fields
  account_id: string | null;
  bank: string | null;
  bankName: string | null;
  bankId: string | null;
  mask: string | null; // end of bank account number
  official_name: string | null;
  balance_current: number | null;
  balance_available: number | null;
  balance_limit: number | null;
  account_sync_source: AccountSyncSource | null;
  last_sync: string | null;
};

export type AccountSyncSource = 'simpleFin' | 'goCardless' | 'pluggyai';
