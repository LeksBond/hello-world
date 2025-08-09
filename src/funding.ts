import fs from 'fs/promises';
import ccxt from 'ccxt';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface FundingPoint {
  timestamp: number;
  rate: number; // in pips
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('exchanges', {
      alias: 'e',
      type: 'string',
      demandOption: true,
      describe: 'Comma-separated exchange ids'
    })
    .option('symbols', {
      alias: 's',
      type: 'string',
      demandOption: true,
      describe: 'Comma-separated trading symbols'
    })
    .option('start', {
      alias: 'from',
      type: 'string',
      demandOption: true,
      describe: 'Start time (ISO8601)'
    })
    .option('end', {
      alias: 'to',
      type: 'string',
      demandOption: true,
      describe: 'End time (ISO8601)'
    })
    .strict()
    .parse();

  const exchanges = (argv.exchanges as string).split(',').map((s) => s.trim());
  const symbols = (argv.symbols as string).split(',').map((s) => s.trim());
  const start = new Date(argv.start as string).getTime();
  const end = new Date(argv.end as string).getTime();

  for (const exchangeId of exchanges) {
    const ExchangeClass = (ccxt as any)[exchangeId];
    if (!ExchangeClass) {
      console.error(`Exchange ${exchangeId} not found`);
      continue;
    }
    const exchange = new ExchangeClass({ enableRateLimit: true });

    if (!exchange.has?.fetchFundingRateHistory) {
      console.error(`${exchangeId} does not support fetchFundingRateHistory`);
      continue;
    }

    for (const symbol of symbols) {
      try {
        let since = start;
        const points: FundingPoint[] = [];
        while (since < end) {
          const rates = await exchange.fetchFundingRateHistory(symbol, since);
          if (!rates.length) break;
          for (const r of rates) {
            if (r.timestamp > end) break;
            points.push({ timestamp: r.timestamp, rate: r.fundingRate * 10000 });
          }
          const last = rates[rates.length - 1].timestamp;
          if (last) {
            since = last + 1;
          } else {
            break;
          }
        }
        const fileName = `funding_${exchangeId}_${symbol.replace(/\//g, '-')}.json`;
        await fs.writeFile(fileName, JSON.stringify(points, null, 2));
        console.log(`Saved ${fileName}`);
      } catch (err) {
        console.error(`Failed to fetch ${exchangeId} ${symbol}:`, err);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
