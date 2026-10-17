import { eq } from "drizzle-orm";
import * as z from "zod";

import { QLOO_BRAND_TAG_TYPES_KEPT, QLOO_CACHE_LIFETIME_DAYS } from "@/config/qloo";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import { qlooCache } from "@/server/db/schema";

import { type QlooLimitState, saveQlooLimitState } from "./limit-state";

// The one way the app talks to Qloo (spec: "Qloo client and cache"). Read-only GET requests with
// the API key, every response cached in the database, and Qloo's report of this month's calls kept
// for the Qloo backstop.

/** A Qloo tag ID, such as `urn:tag:occupation:person:model`. */
export type QlooTagId = `urn:tag:${string}`;

/** Qloo's age buckets for `signal.demographics.age`. */
export type QlooAge = "24_and_younger" | "25_to_29" | "30_to_34" | "35_to_44" | "45_to_54" | "55_and_older";

/** Qloo's gender values, for `signal.demographics.gender` and `filter.gender`. */
export type QlooGender = "male" | "female";

/**
 * Everything a Qloo request may carry, named as Qloo names its parameters. Qloo may receive only
 * the age group, the gender signal, the Country, Photo Style tags, entity IDs, and filter,
 * exclusion, popularity, operator and `take` parameters: nothing that identifies a user or links
 * two requests to one.
 */
export interface QlooQuery {
  /** The user's age group. */
  "signal.demographics.age"?: QlooAge;
  /** The gender signal, from the line (menswear or womenswear). */
  "signal.demographics.gender"?: QlooGender;
  /** The line, as a filter. People only. */
  "filter.gender"?: QlooGender;
  /** The Country's location query. */
  "signal.location.query"?: string;
  /** The Photo Style's `personal_style` tags. */
  "signal.interests.tags"?: readonly QlooTagId[];
  /** Qloo entity IDs, such as a Style Icon's. */
  "signal.interests.entities"?: readonly string[];
  /** Tags the results must carry, the Country's `key_market` tag among them. */
  "filter.tags"?: readonly QlooTagId[];
  /** Tags the results must not carry. */
  "filter.exclude.tags"?: readonly QlooTagId[];
  /** Whether results need any of `filter.tags` (Qloo's default) or all of them. */
  "operator.filter.tags"?: "union" | "intersection";
  "filter.popularity.min"?: number;
  take: number;
}

/** A Brand query: never the Photo Style (ADR-0002), and no `filter.gender`, which is for people only. */
export type QlooBrandQuery = Omit<QlooQuery, "signal.interests.tags" | "filter.gender">;

/** A person Qloo ranked, trimmed to the fields the app uses. */
export interface QlooPerson {
  entityId: string;
  name: string;
  /** Whether Qloo has a date of death for them. The date itself isn't kept. */
  hasDateOfDeath: boolean;
  /** `query.affinity`, when Qloo gives one. */
  affinity: number | null;
}

/** A Brand Qloo ranked, trimmed to the fields the app uses. */
export interface QlooBrand {
  entityId: string;
  name: string;
  /** Its tags of the types the rules read (`QLOO_BRAND_TAG_TYPES_KEPT`), in Qloo's order. */
  tags: QlooTagId[];
  /** Qloo's `target_gender`, such as `["Male", "Female", "Gender-Neutral"]`. */
  targetGender: string[];
  priceRangeUsdMin: number | null;
  priceRangeUsdMax: number | null;
  officialSite: string | null;
  /** `query.affinity`, when Qloo gives one. */
  affinity: number | null;
}

const CACHE_LIFETIME_MS = QLOO_CACHE_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

/** Sends one HTTP request to Qloo. `fetch` in deployments; a fake in tests. */
export type QlooTransport = (request: Request) => Promise<Response>;

export interface QlooClientOptions {
  db: Database;
  clock: Clock;
  transport: QlooTransport;
  apiUrl: string;
  apiKey: string;
}

export class QlooClient {
  constructor(private readonly options: QlooClientOptions) {}

  /** People ranked for the query. */
  people(query: QlooQuery): Promise<QlooPerson[]> {
    return this.insights({ ...query, "filter.type": "urn:entity:person" }, (body) => peopleResponse.parse(body));
  }

  /** Brands ranked for the query. */
  brands(query: QlooBrandQuery): Promise<QlooBrand[]> {
    return this.insights({ ...query, "filter.type": "urn:entity:brand" }, (body) => brandsResponse.parse(body));
  }

  private async insights<T>(params: Record<string, Parameter>, trim: (body: unknown) => T): Promise<T> {
    // The canonical request is both what Qloo receives and the cache key.
    const canonicalRequest = `/v2/insights?${canonicalQueryString(params)}`;
    const { db, clock } = this.options;
    const now = clock.now();
    const [cached] = await db.select().from(qlooCache).where(eq(qlooCache.requestKey, canonicalRequest));
    // The key holds the whole request, Qloo's entity type included, so the body has this request's shape.
    if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_LIFETIME_MS) return cached.body as T;

    const body = trim(await this.send(canonicalRequest));
    await db
      .insert(qlooCache)
      .values({ requestKey: canonicalRequest, body, fetchedAt: now })
      .onConflictDoUpdate({ target: qlooCache.requestKey, set: { body, fetchedAt: now } });
    return body;
  }

  private async send(canonicalRequest: string): Promise<unknown> {
    const { db, clock, transport, apiUrl, apiKey } = this.options;
    const response = await transport(new Request(new URL(canonicalRequest, apiUrl), { method: "GET", headers: { "X-Api-Key": apiKey } }));
    // Every live response, a refusal included, reports this month's calls for the Qloo backstop.
    // Cached answers never get here.
    const limitState = limitStateFrom(response.headers, clock.now());
    if (limitState) await saveQlooLimitState(db, limitState);
    if (response.status === 429) throw new QlooRateLimitedError(headerNumber(response.headers, "Retry-After") ?? undefined);
    if (!response.ok) throw new QlooError(`Qloo answered ${response.status}.`, response.status);
    return response.json();
  }
}

/** Qloo refused a request or couldn't answer it. Nothing is cached. */
export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

/** Qloo answered "too many requests". The caller retries after a back-off. */
export class QlooRateLimitedError extends QlooError {
  constructor(
    /** How long Qloo asked the caller to wait, when it said. */
    readonly retryAfterSeconds: number | undefined,
  ) {
    super("Qloo answered 429: too many requests.", 429);
    this.name = "QlooRateLimitedError";
  }
}

/**
 * Qloo's report of this month's calls on a response, observed at `observedAt`, or null when it
 * carries none. The reset is given in seconds from now, such as `2421095.46`.
 */
function limitStateFrom(headers: Headers, observedAt: Date): QlooLimitState | null {
  const remainingCalls = headerNumber(headers, "X-Month-RateLimit-Remaining");
  if (remainingCalls === null) return null;
  const resetSeconds = headerNumber(headers, "X-Month-RateLimit-Reset");
  return {
    remainingCalls: Math.floor(remainingCalls),
    resetsAt: resetSeconds === null ? null : new Date(observedAt.getTime() + resetSeconds * 1000),
    observedAt,
  };
}

/** A header's value as a number of 0 or more, or null when it's missing or isn't one. */
function headerNumber(headers: Headers, name: string): number | null {
  const value = headers.get(name)?.trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** The Qloo client for QLOO_API_URL and QLOO_API_KEY, over `fetch` unless a transport is given. */
export function qlooClientFromEnvironment({
  db,
  clock,
  transport = (request) => fetch(request),
}: Pick<QlooClientOptions, "db" | "clock"> & { transport?: QlooTransport }): QlooClient {
  const apiUrl = process.env.QLOO_API_URL;
  const apiKey = process.env.QLOO_API_KEY;
  if (!apiUrl || !apiKey) throw new Error("QLOO_API_URL and QLOO_API_KEY must both be set.");
  return new QlooClient({ db, clock, transport, apiUrl, apiKey });
}

type Parameter = string | number | readonly string[] | undefined;

/**
 * The request's query string in canonical form, which is also its cache key: parameters sorted by
 * name, and values normalised, with lists sorted and de-duplicated and empty values dropped.
 */
function canonicalQueryString(params: Record<string, Parameter>): string {
  return Object.entries(params)
    .map(([name, value]) => [name, normalise(value)] as const)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${encode(value)}`)
    .join("&");
}

function normalise(value: Parameter): string {
  if (value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  return [...new Set(value.map(normalise).filter((item) => item !== ""))].sort().join(",");
}

/** Percent-encodes a value, leaving the commas between list items and the colons in IDs readable. */
function encode(value: string): string {
  return encodeURIComponent(value).replaceAll("%2C", ",").replaceAll("%3A", ":");
}

// The trimming. Parsing keeps only the fields named here and drops the rest, descriptions and
// images among them. A field Qloo leaves out or sends in another shape reads as missing.

/** A Qloo Insights response's entities, each trimmed by `entity`. */
function insightsResponse<T extends z.ZodType>(entity: T) {
  return z.object({ results: z.object({ entities: z.array(entity) }) }).transform(({ results }) => results.entities);
}

/** `query.affinity`, or null. */
const queryAffinity = z
  .object({ affinity: z.number().nullable().catch(null) })
  .catch({ affinity: null })
  .transform(({ affinity }) => affinity);

const peopleResponse = insightsResponse(
  z
    .object({
      entity_id: z.string(),
      name: z.string(),
      properties: z.object({ date_of_death: z.unknown() }).partial().catch({}),
      query: queryAffinity,
    })
    .transform(
      ({ entity_id, name, properties, query }): QlooPerson => ({
        entityId: entity_id,
        name,
        hasDateOfDeath: properties.date_of_death != null && properties.date_of_death !== "",
        affinity: query,
      }),
    ),
);

const brandsResponse = insightsResponse(
  z
    .object({
      entity_id: z.string(),
      name: z.string(),
      tags: z.array(z.object({ id: z.string(), type: z.string() })).catch([]),
      properties: z
        .object({
          target_gender: z.array(z.string()).catch([]),
          price_range_usd_min: z.number().nullable().catch(null),
          price_range_usd_max: z.number().nullable().catch(null),
          official_site: z.string().nullable().catch(null),
        })
        .catch({ target_gender: [], price_range_usd_min: null, price_range_usd_max: null, official_site: null }),
      query: queryAffinity,
    })
    .transform(
      ({ entity_id, name, tags, properties, query }): QlooBrand => ({
        entityId: entity_id,
        name,
        tags: tags.filter((tag) => QLOO_BRAND_TAG_TYPES_KEPT.includes(tag.type)).map((tag) => tag.id as QlooTagId),
        targetGender: properties.target_gender,
        priceRangeUsdMin: properties.price_range_usd_min,
        priceRangeUsdMax: properties.price_range_usd_max,
        officialSite: properties.official_site,
        affinity: query,
      }),
    ),
);
