import { inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { EXCHANGE_RATE_SOURCES, EXCHANGE_RATE_TIMEOUT_MS, type ExchangeRateSource, isCurrencyCode } from "@/config/currencies";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { exchangeRate } from "@/server/db/schema";
import type { ExchangeRates } from "@/server/outfit-assembly/prices";

// The exchange rates (spec: "Prices and currencies"): one rate to the US dollar per currency, which
// the daily sweep refreshes, and pages and searches read. The sources get a plain request for every
// currency's rates, never anything about a user.

/** Sends one HTTP request to a rate source. `fetch` in deployments; a fake in tests. */
export type ExchangeRateTransport = (request: Request) => Promise<Response>;

/**
 * Fetches every currency's rate to the US dollar from Frankfurter, or from fawazahmed0's currency API
 * when Frankfurter fails, and stores them as fetched now. When both fail, the rates stored before
 * stay, and so does any currency's that the day's source leaves out. Says which source it used, or
 * null when both failed.
 */
export async function refreshExchangeRates({
  db,
  clock,
  exchangeRateTransport,
}: {
  db: Database;
  clock: Clock;
  exchangeRateTransport: ExchangeRateTransport;
}): Promise<ExchangeRateSource | null> {
  for (const source of ["frankfurter", "fawazahmed0"] as const) {
    let rates: Map<string, number>;
    try {
      rates = await fetchRates(exchangeRateTransport, source);
    } catch (error) {
      console.warn(`The ${source} exchange rates couldn't be fetched:`, error instanceof Error ? error.message : "unknown error");
      continue;
    }
    const fetchedAt = clock.now();
    await db
      .insert(exchangeRate)
      .values([...rates].map(([currency, ratePerUsd]) => ({ currency, ratePerUsd, fetchedAt })))
      .onConflictDoUpdate({
        target: exchangeRate.currency,
        set: { ratePerUsd: sql`excluded.${sql.identifier(exchangeRate.ratePerUsd.name)}`, fetchedAt },
      });
    return source;
  }
  console.error("No exchange rate source answered, so the rates stored before stay.");
  return null;
}

/** The stored rates of these currencies, each to the US dollar: those with none stored are missing. */
export async function readExchangeRates(db: Database | Transaction, currencies: readonly string[]): Promise<ExchangeRates> {
  if (currencies.length === 0) return new Map();
  const rows = await db
    .select({ currency: exchangeRate.currency, ratePerUsd: exchangeRate.ratePerUsd })
    .from(exchangeRate)
    .where(inArray(exchangeRate.currency, [...new Set(currencies)]));
  return new Map(rows.map(({ currency, ratePerUsd }) => [currency, ratePerUsd]));
}

/** Frankfurter's answer: one rate per currency, each to the base asked for. */
const frankfurterAnswer = z.array(z.object({ base: z.literal("USD"), quote: z.string(), rate: z.number() }));

/** fawazahmed0's currency API's answer: the US dollar's rate to each currency, by its lower-case code. */
const fawazahmed0Answer = z.object({ usd: z.record(z.string(), z.number()) });

/**
 * One source's rates, by ISO 4217 code, keeping only three-letter codes and positive rates. Throws
 * when the source fails, within EXCHANGE_RATE_TIMEOUT_MS, or answers with no rates at all.
 */
async function fetchRates(transport: ExchangeRateTransport, source: ExchangeRateSource): Promise<Map<string, number>> {
  const response = await transport(new Request(EXCHANGE_RATE_SOURCES[source], { signal: AbortSignal.timeout(EXCHANGE_RATE_TIMEOUT_MS) }));
  if (!response.ok) throw new Error(`It answered ${response.status}.`);
  const body: unknown = await response.json();
  const entries: [string, number][] =
    source === "frankfurter"
      ? frankfurterAnswer.parse(body).map(({ quote, rate }) => [quote, rate])
      : Object.entries(fawazahmed0Answer.parse(body).usd).map(([code, rate]) => [code.toUpperCase(), rate]);
  const rates = new Map(entries.filter(([currency, rate]) => isCurrencyCode(currency) && Number.isFinite(rate) && rate > 0));
  if (rates.size === 0) throw new Error("It gave no rates.");
  return rates;
}
