import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid';

import { encryptedSecretsService } from '#services/encrypted-secrets-service';

function getClient() {
  const clientId = encryptedSecretsService.get('plaid_clientId');
  const secret = encryptedSecretsService.get('plaid_clientSecret');
  if (!clientId || !secret) {
    throw new Error('Plaid credentials are not configured');
  }
  const configuration = new Configuration({
    basePath: PlaidEnvironments.production,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  return new PlaidApi(configuration);
}

function isLiabilitySubtype(subtype) {
  if (!subtype) return false;
  return ['credit card', 'credit', 'loan', 'mortgage', 'line of credit'].some(
    s => subtype.toLowerCase().includes(s),
  );
}

function normalizeAccount(a) {
  const balanceCurrent = a.balances?.current ?? null;
  const balanceAvailable = a.balances?.available ?? null;
  const liability =
    isLiabilitySubtype(a.subtype) || a.type === 'credit' || a.type === 'loan';
  const signed =
    liability && balanceCurrent != null ? -balanceCurrent : balanceCurrent;
  return {
    account_id: a.account_id,
    name: a.name,
    official_name: a.official_name ?? null,
    mask: a.mask ?? null,
    type: a.type,
    subtype: a.subtype,
    balance: signed,
    balance_current: signed,
    balance_available: balanceAvailable,
    balance_limit: a.balances?.limit ?? null,
    iso_currency_code: a.balances?.iso_currency_code ?? null,
  };
}

function normalizeTransaction(t) {
  return {
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    amount: -t.amount,
    date: t.date,
    name: t.merchant_name || t.name,
    pending: t.pending,
    iso_currency_code: t.iso_currency_code,
  };
}

export const plaidService = {
  async createLinkToken({ userId, accessToken } = {}) {
    const client = getClient();
    const payload = {
      user: { client_user_id: userId || 'actual-user' },
      client_name: 'Actual Budget',
      country_codes: [CountryCode.Us],
      language: 'en',
    };
    if (accessToken) {
      // Update mode: refreshes auth for an existing Item. No `products` allowed.
      payload.access_token = accessToken;
    } else {
      payload.products = [Products.Transactions];
    }
    const resp = await client.linkTokenCreate(payload);
    return resp.data.link_token;
  },

  async exchangePublicToken(publicToken) {
    const client = getClient();
    const resp = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });
    return {
      access_token: resp.data.access_token,
      item_id: resp.data.item_id,
    };
  },

  async getAccounts(accessToken) {
    const client = getClient();
    const resp = await client.accountsGet({ access_token: accessToken });
    return {
      accounts: resp.data.accounts.map(normalizeAccount),
      item: resp.data.item,
    };
  },

  async getItem(accessToken) {
    const client = getClient();
    const resp = await client.itemGet({ access_token: accessToken });
    return resp.data;
  },

  async getInstitution(institutionId) {
    if (!institutionId) return null;
    try {
      const client = getClient();
      const resp = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
        options: { include_optional_metadata: true },
      });
      const inst = resp.data.institution;
      return {
        institution_id: institutionId,
        name: inst.name,
        logo: inst.logo ?? null,
        url: inst.url ?? null,
        primary_color: inst.primary_color ?? null,
      };
    } catch {
      return { institution_id: institutionId, name: null, logo: null, url: null, primary_color: null };
    }
  },

  async syncTransactions(accessToken, cursor) {
    const client = getClient();
    let allAdded = [];
    let allModified = [];
    let allRemoved = [];
    let hasMore = true;
    let nextCursor = cursor || null;
    while (hasMore) {
      const resp = await client.transactionsSync({
        access_token: accessToken,
        cursor: nextCursor || undefined,
      });
      allAdded = allAdded.concat(resp.data.added);
      allModified = allModified.concat(resp.data.modified);
      allRemoved = allRemoved.concat(resp.data.removed);
      hasMore = resp.data.has_more;
      nextCursor = resp.data.next_cursor;
    }
    return {
      added: allAdded.map(normalizeTransaction),
      modified: allModified.map(normalizeTransaction),
      removed: allRemoved.map(r => ({ transaction_id: r.transaction_id })),
      next_cursor: nextCursor,
    };
  },

  async removeItem(accessToken) {
    const client = getClient();
    await client.itemRemove({ access_token: accessToken });
  },
};
