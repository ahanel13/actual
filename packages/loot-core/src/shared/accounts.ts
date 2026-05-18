import type { AccountType } from '#types/models';

const ON_BUDGET_TYPES = new Set<AccountType>(['cash', 'credit_card']);

export function getOffBudgetForType(
  type: AccountType | null | undefined,
): 0 | 1 {
  if (type == null) return 0;
  return ON_BUDGET_TYPES.has(type) ? 0 : 1;
}
