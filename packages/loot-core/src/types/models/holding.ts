export type HoldingEntity = {
  id: string;
  account_id: string;
  symbol: string;
  name?: string | null;
  shares: number;
  cost_basis_per_share?: number | null;
  currency: string;
};

export type PriceCacheEntry = {
  symbol: string;
  price: number;
  currency: string;
  fetched_at: string;
};

export type HoldingWithPrice = HoldingEntity & {
  current_price: number | null;
  price_fetched_at: string | null;
};
