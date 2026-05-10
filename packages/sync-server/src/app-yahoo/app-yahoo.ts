import dns from 'dns/promises';
import https from 'https';

import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

const app = express();
export { app as handlers };

app.use(requestLoggerMiddleware);
app.use(express.json());
app.use(validateSessionMiddleware);

const YAHOO_HOSTNAME = 'query1.finance.yahoo.com';

async function resolveIPv4(hostname: string): Promise<string> {
  const addresses = await dns.resolve4(hostname);
  return addresses[0];
}

async function fetchQuote(symbol: string): Promise<{
  symbol: string;
  price: number;
  currency: string;
  name: string;
} | null> {
  const ipv4 = await resolveIPv4(YAHOO_HOSTNAME);
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: ipv4,
        path,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Host: YAHOO_HOSTNAME,
        },
        servername: YAHOO_HOSTNAME,
        timeout: 10_000,
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              resolve(null);
              return;
            }
            const data = JSON.parse(raw) as {
              chart?: {
                result?: Array<{
                  meta?: {
                    regularMarketPrice?: number;
                    currency?: string;
                    longName?: string;
                    shortName?: string;
                  };
                }>;
              };
            };
            const meta = data?.chart?.result?.[0]?.meta;
            if (!meta?.regularMarketPrice) {
              resolve(null);
              return;
            }
            resolve({
              symbol,
              price: meta.regularMarketPrice,
              currency: meta.currency ?? 'USD',
              name: meta.longName ?? meta.shortName ?? symbol,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

app.post('/quote', async (req, res) => {
  const { symbols } = req.body as { symbols: string[] };

  if (!Array.isArray(symbols) || symbols.length === 0) {
    res.status(400).json({ error: 'symbols must be a non-empty array' });
    return;
  }

  const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));

  const quotes = results
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean);

  res.json({ status: 'ok', data: { quotes } });
});
