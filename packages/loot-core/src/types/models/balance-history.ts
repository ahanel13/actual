export type BalanceHistoryEntity = {
  id: string;
  account_id: string;
  date: string;    // YYYY-MM-DD
  balance: number; // integer cents
};
