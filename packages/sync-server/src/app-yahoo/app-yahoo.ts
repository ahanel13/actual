import express from 'express';
import YahooFinance from 'yahoo-finance2';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

const yf = new YahooFinance();

const app = express();
export { app as handlers };

app.use(requestLoggerMiddleware);
app.use(express.json());
app.use(validateSessionMiddleware);

app.post('/quote', async (req, res) => {
  const { symbols } = req.body as { symbols: string[] };

  if (!Array.isArray(symbols) || symbols.length === 0) {
    res.status(400).json({ error: 'symbols must be a non-empty array' });
    return;
  }

  const results = await Promise.allSettled(
    symbols.map(symbol =>
      yf.quote(symbol, {
        fields: ['regularMarketPrice', 'currency', 'longName'],
      }),
    ),
  );

  const quotes = results
    .map((result, i) => {
      if (result.status === 'fulfilled' && result.value.regularMarketPrice) {
        return {
          symbol: symbols[i],
          price: result.value.regularMarketPrice,
          currency: result.value.currency ?? 'USD',
          name: result.value.longName ?? symbols[i],
        };
      }
      return null;
    })
    .filter(Boolean);

  res.json({ quotes });
});
