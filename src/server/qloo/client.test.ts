import { afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { Database } from "@/server/db/database";
import { openPgliteDatabase } from "@/server/db/pglite";
import { qlooCache } from "@/server/db/schema";
import { TestClock } from "@/test/harness";

import { type QlooBrandQuery, QlooClient, qlooClientFromEnvironment, QlooError, type QlooQuery, QlooRateLimitedError } from "./client";
import { FakeQlooTransport, qlooResponse, qlooTooManyRequests } from "./fake";

// Small hand-written samples shaped like Qloo's entities, descriptions and images included so the
// trimming has something to drop. The people and Brands are made up.

const MIRA_VALE = {
  name: "Mira Vale",
  entity_id: "00000000-0000-4000-8000-000000000001",
  type: "urn:entity",
  subtype: "urn:entity:person",
  properties: {
    short_descriptions: [{ value: "Singer and actress (born 1996)", languages: ["en"] }],
    image: { url: "https://images.example/mira-vale.jpg" },
    gender: ["female"],
    date_of_birth: "1996-09-01",
  },
  popularity: 0.999,
  tags: [{ id: "urn:tag:occupation:person:singer", name: "Singer", type: "urn:tag:occupation:person" }],
  query: { affinity: 0.946, measurements: { audience_growth: 0 } },
  disambiguation: "1996-09-01",
  external: { instagram: [{ id: "miravale" }] },
};

const OTTO_LANE = {
  name: "Otto Lane",
  entity_id: "00000000-0000-4000-8000-000000000002",
  type: "urn:entity",
  subtype: "urn:entity:person",
  properties: {
    short_descriptions: [{ value: "Actor (1931–1999)", languages: ["en"] }],
    image: { url: "https://images.example/otto-lane.jpg" },
    date_of_death: "1999-02-11",
  },
  popularity: 0.998,
  tags: [{ id: "urn:tag:occupation:person:actor", name: "Actor", type: "urn:tag:occupation:person" }],
  query: { affinity: 0.912 },
};

const NORTHBOUND = {
  name: "Northbound",
  entity_id: "00000000-0000-4000-8000-0000000000b1",
  type: "urn:entity",
  subtype: "urn:entity:brand",
  properties: {
    description: "An outdoor label known for rugged boots and denim.",
    short_description: "Outdoor clothing and footwear label",
    style_description: "Rugged, utilitarian, heritage.",
    image: { url: "https://images.example/northbound.jpg" },
    official_site: "https://northbound.example",
    target_gender: ["Male", "Female", "Gender-Neutral"],
    target_income_level: ["Medium", "Medium to High"],
    price_range_usd_min: 30,
    price_range_usd_max: 250,
  },
  popularity: 0.997,
  tags: [
    { id: "urn:tag:genre:brand:fashion", name: "Fashion", type: "urn:tag:genre:brand" },
    { id: "urn:tag:product_category:qloo:apparel", name: "Apparel", type: "urn:tag:product_category:qloo" },
    { id: "urn:tag:personal_style:qloo:rugged", name: "Rugged", type: "urn:tag:personal_style:qloo" },
    { id: "urn:tag:product_category:qloo:footwear", name: "Footwear", type: "urn:tag:product_category:qloo" },
    { id: "urn:tag:genre:brand:fashion:jeans", name: "Jeans", type: "urn:tag:genre:brand" },
    { id: "urn:tag:key_market:qloo:united_states", name: "United States", type: "urn:tag:key_market:qloo" },
    { id: "urn:tag:signature_piece:qloo:trail_boot", name: "Trail Boot", type: "urn:tag:signature_piece:qloo" },
    { id: "urn:tag:target_income_level:qloo:medium", name: "Medium", type: "urn:tag:target_income_level:qloo" },
  ],
  query: { affinity: 0.981, measurements: { audience_growth: 0 } },
  disambiguation: "Outdoor label",
  external: {},
};

/** A Brand Qloo knows little about: no properties, tags or affinity. */
const BARE_BRAND = {
  name: "Bare Label",
  entity_id: "00000000-0000-4000-8000-0000000000b2",
  type: "urn:entity",
  subtype: "urn:entity:brand",
  properties: { official_site: null },
};

const BRAND_QUERY: QlooBrandQuery = {
  "signal.interests.entities": ["00000000-0000-4000-8000-000000000001"],
  "filter.tags": ["urn:tag:genre:brand:fashion"],
  take: 50,
};

const STYLE_ICON_QUERY: QlooQuery = {
  "filter.tags": ["urn:tag:occupation:person:model", "urn:tag:occupation:person:singer"],
  "signal.demographics.age": "24_and_younger",
  "signal.demographics.gender": "female",
  "filter.popularity.min": 0.995,
  take: 50,
};

let db: Database;
let clock: TestClock;
let qloo: FakeQlooTransport;
let client: QlooClient;

beforeAll(async () => {
  db = await openPgliteDatabase();
});

beforeEach(async () => {
  await db.delete(qlooCache);
  clock = new TestClock(new Date("2026-10-16T12:00:00Z"));
  qloo = new FakeQlooTransport();
  client = new QlooClient({ db, clock, transport: qloo.send, apiUrl: "https://qloo.test", apiKey: "test-api-key" });
});

describe("requests to Qloo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are GETs to QLOO_API_URL with QLOO_API_KEY in the X-Api-Key header and nothing else", async () => {
    vi.stubEnv("QLOO_API_URL", "https://qloo.test/");
    vi.stubEnv("QLOO_API_KEY", "key-from-the-environment");

    await qlooClientFromEnvironment({ db, clock, transport: qloo.send }).people(STYLE_ICON_QUERY);

    expect(qloo.requests).toHaveLength(1);
    const [request] = qloo.requests;
    expect(request!.method).toBe("GET");
    expect([...request!.headers]).toEqual([["x-api-key", "key-from-the-environment"]]);
    expect(`${request!.url.origin}${request!.url.pathname}`).toBe("https://qloo.test/v2/insights");
    expect([...request!.url.searchParams]).toEqual([
      ["filter.popularity.min", "0.995"],
      ["filter.tags", "urn:tag:occupation:person:model,urn:tag:occupation:person:singer"],
      ["filter.type", "urn:entity:person"],
      ["signal.demographics.age", "24_and_younger"],
      ["signal.demographics.gender", "female"],
      ["take", "50"],
    ]);
  });

  it("can't be made without both QLOO_API_URL and QLOO_API_KEY", () => {
    vi.stubEnv("QLOO_API_URL", "https://qloo.test");
    vi.stubEnv("QLOO_API_KEY", "");

    expect(() => qlooClientFromEnvironment({ db, clock })).toThrow("QLOO_API_URL and QLOO_API_KEY must both be set.");
  });
});

describe("the Qloo cache", () => {
  it("serves a repeat of a request from the cache, without calling Qloo again", async () => {
    qloo.respond = () => qlooResponse([MIRA_VALE]);

    const first = await client.people(STYLE_ICON_QUERY);
    clock.set("2026-10-29T12:00:00Z");
    const second = await client.people(STYLE_ICON_QUERY);

    expect(qloo.requests).toHaveLength(1);
    expect(first).toEqual([{ entityId: "00000000-0000-4000-8000-000000000001", name: "Mira Vale", hasDateOfDeath: false, affinity: 0.946 }]);
    expect(second).toEqual(first);
  });

  it("asks Qloo again once an entry is 30 days old, and serves the new answer from then on", async () => {
    qloo.respond = () => qlooResponse([MIRA_VALE]);
    await client.people(STYLE_ICON_QUERY);

    clock.set("2026-11-15T11:59:59Z");
    await client.people(STYLE_ICON_QUERY);
    expect(qloo.requests).toHaveLength(1);

    qloo.respond = () => qlooResponse([{ ...MIRA_VALE, query: { affinity: 0.9 } }]);
    clock.set("2026-11-15T12:00:00Z");
    const refetched = await client.people(STYLE_ICON_QUERY);
    clock.set("2026-11-20T12:00:00Z");
    const servedAfter = await client.people(STYLE_ICON_QUERY);

    expect(qloo.requests).toHaveLength(2);
    expect(refetched.map((person) => person.affinity)).toEqual([0.9]);
    expect(servedAfter).toEqual(refetched);
  });

  it("serves the same request with its parameters and their values reordered from the same entry", async () => {
    qloo.respond = () => qlooResponse([MIRA_VALE]);

    await client.people(STYLE_ICON_QUERY);
    await client.people({
      take: 50,
      "filter.popularity.min": 0.995,
      "signal.demographics.gender": "female",
      "signal.demographics.age": "24_and_younger",
      "filter.tags": ["urn:tag:occupation:person:singer", "urn:tag:occupation:person:model"],
    });

    expect(qloo.requests).toHaveLength(1);
  });

  it("asks Qloo again for a request that differs", async () => {
    qloo.respond = () => qlooResponse([MIRA_VALE]);

    await client.people(STYLE_ICON_QUERY);
    await client.people({ ...STYLE_ICON_QUERY, "signal.demographics.age": "25_to_29" });
    await client.people({ ...STYLE_ICON_QUERY, "filter.tags": ["urn:tag:occupation:person:model"] });

    expect(qloo.requests).toHaveLength(3);
  });
});

describe("what the cache keeps", () => {
  it("keeps only each person's entity ID, name, whether they have a date of death, and affinity", async () => {
    qloo.respond = () => qlooResponse([MIRA_VALE, OTTO_LANE]);

    const people = await client.people(STYLE_ICON_QUERY);

    const expected = [
      { entityId: "00000000-0000-4000-8000-000000000001", name: "Mira Vale", hasDateOfDeath: false, affinity: 0.946 },
      { entityId: "00000000-0000-4000-8000-000000000002", name: "Otto Lane", hasDateOfDeath: true, affinity: 0.912 },
    ];
    expect(people).toEqual(expected);
    expect(await cachedBodies()).toEqual([expected]);
  });

  it("keeps only each Brand's entity ID, name, category tags, target gender, price range, official site and affinity", async () => {
    qloo.respond = () => qlooResponse([NORTHBOUND, BARE_BRAND]);

    const brands = await client.brands(BRAND_QUERY);

    const expected = [
      {
        entityId: "00000000-0000-4000-8000-0000000000b1",
        name: "Northbound",
        tags: [
          "urn:tag:genre:brand:fashion",
          "urn:tag:product_category:qloo:apparel",
          "urn:tag:product_category:qloo:footwear",
          "urn:tag:genre:brand:fashion:jeans",
        ],
        targetGender: ["Male", "Female", "Gender-Neutral"],
        priceRangeUsdMin: 30,
        priceRangeUsdMax: 250,
        officialSite: "https://northbound.example",
        affinity: 0.981,
      },
      {
        entityId: "00000000-0000-4000-8000-0000000000b2",
        name: "Bare Label",
        tags: [],
        targetGender: [],
        priceRangeUsdMin: null,
        priceRangeUsdMax: null,
        officialSite: null,
        affinity: null,
      },
    ];
    expect(brands).toEqual(expected);
    expect(await cachedBodies()).toEqual([expected]);
  });
});

/** The body of every cache entry. */
async function cachedBodies(): Promise<unknown[]> {
  const rows = await db.select({ body: qlooCache.body }).from(qlooCache);
  return rows.map((row) => row.body);
}

describe("when Qloo can't answer", () => {
  it("surfaces too many requests as an error to retry after a back-off, and caches nothing", async () => {
    qloo.respond = () => qlooTooManyRequests({ "Retry-After": "2" });

    const error = await client.people(STYLE_ICON_QUERY).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(QlooRateLimitedError);
    expect(error).toMatchObject({ retryAfterSeconds: 2 });
    qloo.respond = () => qlooResponse([MIRA_VALE]);
    expect(await client.people(STYLE_ICON_QUERY)).toHaveLength(1);
    expect(qloo.requests).toHaveLength(2);
  });

  it("surfaces any other failure as an error with Qloo's status, and caches nothing", async () => {
    qloo.respond = () => Response.json({ error: "at least one valid signal or filter is required" }, { status: 400 });

    const error = await client.brands(BRAND_QUERY).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(QlooError);
    expect(error).not.toBeInstanceOf(QlooRateLimitedError);
    expect(error).toMatchObject({ status: 400 });
    expect(await cachedBodies()).toEqual([]);
  });
});

// Checked by `npm run typecheck`: expectTypeOf does nothing at runtime.
describe("what a Qloo request may carry", () => {
  it("is only the age group, gender signal, Country, Photo Style tags, entity IDs, and filter, exclusion, popularity, operator and take parameters", () => {
    // Adding a field fails this test, so whoever adds one has to show it can't identify a user or
    // link two requests to one.
    expectTypeOf<keyof QlooQuery>().toEqualTypeOf<
      | "signal.demographics.age"
      | "signal.demographics.gender"
      | "filter.gender"
      | "signal.location.query"
      | "signal.interests.tags"
      | "signal.interests.entities"
      | "filter.tags"
      | "filter.exclude.tags"
      | "operator.filter.tags"
      | "filter.popularity.min"
      | "take"
    >();
  });

  it("has no field for a user ID, username, email, photo or session", () => {
    type UserField = Extract<
      Lowercase<keyof QlooQuery>,
      `${string}${"user" | "name" | "mail" | "photo" | "image" | "session" | "cookie" | "id"}${string}`
    >;
    expectTypeOf<UserField>().toBeNever();
  });

  it("never sends the Photo Style on a Brand query (ADR-0002)", () => {
    expectTypeOf<QlooBrandQuery>().not.toHaveProperty("signal.interests.tags");
    expectTypeOf<Parameters<QlooClient["brands"]>[0]>().toEqualTypeOf<QlooBrandQuery>();
  });
});
