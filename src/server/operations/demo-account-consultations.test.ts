import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
import { OUTFIT_ALLOWANCE, PHOTO_CHECK_LIMIT } from "@/config/limits";
import { needsPhotoConsent } from "@/server/accounts/photo-consent";
import { consultation, qlooCache, qlooLimitState, usageRecord } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { refreshPrices } from "@/server/operations/price-refresh";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp } from "@/server/operations/sign-up";
import { createDemoAccount } from "@/server/operations/team";
import { changePhotoStyle, showMoreOutfits } from "@/server/operations/stylings";
import { readUsageSummary } from "@/server/operations/usage";
import { channel3Offer, channel3Product, channel3ProductDetail, channel3SellingEveryBrand } from "@/server/product-search/fake-channel3";
import { qlooBrand, qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { saveQlooLimitState } from "@/server/qloo/limit-state";
import { recordUsage } from "@/server/usage/records";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two
// Outfits, and two more for "Show 2 more Outfits".
const STYLE_ICONS = [
  qlooPerson("p-1", "Ava Stone", 0.94),
  qlooPerson("p-2", "Bea Marsh", 0.91),
  qlooPerson("p-3", "Cleo Hart", 0.88),
  qlooPerson("p-4", "Dana Reed", 0.86),
  qlooPerson("p-5", "Esme Vale", 0.84),
];

// Made-up Brands, shaped like Qloo's Brand entities, for a body photo's Outfits: the first is Bolt,
// Jeanery (denim, so the Bottom) and Stride, the second Dune, Bolt and Sole.
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180] }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120] }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel"], affinity: 0.9 }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
];

const DEMO_PASSWORD = "the judges' shared password";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  // As the team's script does, with no request and no sign-in.
  expect(await createDemoAccount(harness.context(new TestBrowser()), { password: DEMO_PASSWORD })).toEqual({ ok: true });
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.ai.duringCall = undefined;
  harness.ai.photoCheckCount = 0;
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  harness.channel3.respond = channel3SellingEveryBrand();
  await harness.db.delete(qlooCache);
  // The app-wide caps count every user's Outfits, so each test starts with none made, and with no
  // report from Qloo of the calls left.
  await harness.db.delete(usageRecord);
  await harness.db.delete(qlooLimitState);
});

describe("the Demo Account's exemptions", () => {
  it.each([
    {
      limit: "the app-wide 24-hour cap",
      reach: () => outfitsMadeByOthers(100, "2026-10-16T09:00:00Z"),
      refusal: { refusal: "app-wide-24-hour-cap" },
    },
    {
      limit: "the app-wide monthly cap",
      reach: () => outfitsMadeByOthers(750, "2026-10-05T09:00:00Z"),
      refusal: { refusal: "app-wide-monthly-cap" },
    },
    {
      limit: "the Qloo backstop",
      reach: () => saveQlooLimitState(harness.db, { remainingCalls: 999, resetsAt: new Date("2026-11-13T00:00:00Z"), observedAt: harness.clock.now() }),
      refusal: { refusal: "qloo-backstop" },
    },
  ])("lets a Styling start, making 2 Outfits, while $limit stops everyone else's, with no Outfit Allowance to show", async ({ reach, refusal }) => {
    await reach();
    const judge = await signedInJudge();
    expect(await readUsageSummary(harness.context(await signedInUser()))).toMatchObject({ stylingStart: { ok: false, ...refusal } });

    expect(await readUsageSummary(harness.context(judge))).toEqual({
      outfitsLeft: null,
      moreOutfitsFrom: null,
      stylingStart: { ok: true, outfitsWanted: 2 },
    });
    const consultationId = await styleNewConsultation(judge);
    expect((await readConsultation(harness.context(judge), consultationId))!.outfits).toHaveLength(2);
  });

  it("makes 2 Outfits in a Styling when the app-wide 24-hour cap would leave 1, and they don't count towards it", async () => {
    await outfitsMadeByOthers(99, "2026-10-16T09:00:00Z");
    const judge = await signedInJudge();

    const consultationId = await styleNewConsultation(judge);

    expect((await readConsultation(harness.context(judge), consultationId))!.outfits).toHaveLength(2);
    expect(await readUsageSummary(harness.context(await signedInUser()))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 1 } });
  });

  it("makes 2 Outfits in every Styling past the Outfit Allowance's 10 a day", async () => {
    const judge = await signedInJudge();

    for (let styled = 0; styled < OUTFIT_ALLOWANCE / 2 + 1; styled += 1) {
      const consultationId = await styleNewConsultation(judge);
      expect((await readConsultation(harness.context(judge), consultationId))!.outfits).toHaveLength(2);
    }
    expect(await readUsageSummary(harness.context(judge))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("checks photos past the photo-check limit's 20 a day, and none of its usage is recorded", async () => {
    const judge = await signedInJudge();
    harness.ai.scenario = "no-person";
    for (let sent = 0; sent < PHOTO_CHECK_LIMIT; sent += 1) {
      expect(await getMyOutfits(judge)).toMatchObject({ ok: false, refusal: "photo-rejected" });
    }
    harness.ai.scenario = "pass";

    expect(await getMyOutfits(judge)).toEqual({ ok: true, consultationId: expect.any(String) });
    await harness.stylings.runPending();
    expect(harness.ai.photoCheckCount).toBe(PHOTO_CHECK_LIMIT + 1);
    expect(await harness.db.select().from(usageRecord).where(eq(usageRecord.userId, await demoAccountId()))).toEqual([]);
  });
});

describe("what still holds on the Demo Account", () => {
  it("is the region gate, on every Styling", async () => {
    const judge = await signedInJudge();
    const consultationId = await styleNewConsultation(judge);
    const photoChecks = harness.ai.photoCheckCount;

    judge.ipCountry = "RU";

    expect(await readUsageSummary(harness.context(judge))).toMatchObject({ stylingStart: { ok: false, refusal: "unsupported-region" } });
    expect(await getMyOutfits(judge)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(await showMoreOutfits(harness.context(judge), consultationId)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    expect(harness.stylings.pending).toEqual([]);
  });

  it("is the photo check, which stores nothing for a photo it rejects", async () => {
    const judge = await signedInJudge();
    harness.ai.scenario = "more-than-one-person";

    expect(await getMyOutfits(judge)).toEqual({ ok: false, refusal: "photo-rejected", rejection: { reason: "more-than-one-person" } });
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });
});

describe("photo consent on the Demo Account", () => {
  it("is asked for before every Consultation, refusing one without both ticks even once a judge has agreed, storing nothing", async () => {
    const judge = await signedInJudge();
    await styleNewConsultation(judge);
    const photoChecks = harness.ai.photoCheckCount;
    const stored = harness.blob.objects.size;

    expect(needsPhotoConsent((await readSignedInUser(harness.context(judge)))!)).toBe(true);
    for (const consent of [undefined, { storeAndProcess: true, sendToGemini: false }, { storeAndProcess: false, sendToGemini: true }]) {
      expect(await startConsultation(harness.context(judge), { photo: await jpeg(), photoType: "face", consent })).toEqual({
        ok: false,
        refusal: "photo-consent-needed",
      });
    }
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    expect(harness.blob.objects.size).toBe(stored);
    expect(await getMyOutfits(judge)).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it("keeps each judge's agreement, the photo notice's version and when, on the Consultation it was for, and none on the account", async () => {
    const judge = await signedInJudge();
    const otherJudge = await signedInJudge();
    harness.clock.set("2026-10-16T12:34:56Z");
    const first = await start(judge);
    harness.clock.set("2026-10-16T13:05:00Z");
    const second = await start(otherJudge);

    expect(await photoConsentOn(first)).toEqual({ acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: new Date("2026-10-16T12:34:56Z") });
    expect(await photoConsentOn(second)).toEqual({ acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: new Date("2026-10-16T13:05:00Z") });
    expect((await readSignedInUser(harness.context(judge)))!.photoConsent).toBeNull();
  });
});

describe("Stylings on the Demo Account", () => {
  it("let a judge start a Consultation while another judge's Styling runs, and both finish with their Outfits", async () => {
    const judge = await signedInJudge();
    const otherJudge = await signedInJudge();
    const first = await start(judge);

    expect(await readUsageSummary(harness.context(otherJudge))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
    const second = await start(otherJudge);

    expect(harness.stylings.pending).toHaveLength(2);
    await harness.stylings.runPending();
    for (const consultationId of [first, second]) {
      expect((await readConsultation(harness.context(judge), consultationId))!.outfits).toHaveLength(2);
    }
  });

  it("let two judges each start a Styling on a different Consultation at once", async () => {
    const judge = await signedInJudge();
    const otherJudge = await signedInJudge();
    const one = await styleNewConsultation(judge);
    const other = await styleNewConsultation(otherJudge);

    const results = await Promise.all([
      showMoreOutfits(harness.context(judge), one),
      changePhotoStyle(harness.context(otherJudge), other, ["edgy"]),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(harness.stylings.pending).toHaveLength(2);
    await harness.stylings.runPending();
    expect((await readConsultation(harness.context(judge), one))!.outfits).toHaveLength(4);
    expect((await readConsultation(harness.context(judge), other))!).toMatchObject({ photoStyle: ["edgy"], outfits: [{}, {}] });
  });

  it("build a body photo's Outfits from real Products, as anyone's are", async () => {
    harness.qloo.respond = (request) =>
      qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : STYLE_ICONS);
    const judge = await signedInJudge();
    const started = await startConsultation(harness.context(judge), { photo: await jpeg(), photoType: "body_only", consent: BOTH_CONSENT_BOXES_TICKED });
    if (!started.ok) throw new Error(`Couldn't start a Consultation: ${started.refusal}`);

    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(judge), started.consultationId))!;
    expect(outfits.map((o) => o.pieces.map((p) => [p.category, p.brand?.name, p.product?.available ? p.product.shopDomain : undefined]))).toEqual([
      [
        ["top", "Bolt", "shop.example"],
        ["bottom", "Jeanery", "shop.example"],
        ["shoes", "Stride", "shop.example"],
      ],
      [
        ["top", "Dune", "shop.example"],
        ["bottom", "Bolt", "shop.example"],
        ["shoes", "Sole", "shop.example"],
      ],
    ]);
  });

  it("have their Products' prices refreshed by any judge who opens them, as every judge sees every Consultation on it", async () => {
    harness.qloo.respond = (request) =>
      qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : STYLE_ICONS);
    const judge = await signedInJudge();
    const started = await startConsultation(harness.context(judge), { photo: await jpeg(), photoType: "body_only", consent: BOTH_CONSENT_BOXES_TICKED });
    if (!started.ok) throw new Error(`Couldn't start a Consultation: ${started.refusal}`);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({
      checks: ({ productId }) => channel3ProductDetail(channel3Product(productId, { offers: [channel3Offer({ price: 52 })] })),
    });

    expect(await refreshPrices(harness.context(await signedInJudge()), started.consultationId)).toEqual({ ok: true });

    const { outfits } = (await readConsultation(harness.context(judge), started.consultationId))!;
    expect(outfits.flatMap((o) => o.pieces.map((p) => (p.product?.available ? [p.product.price, p.product.pricedOn] : null)))).toEqual(
      Array.from({ length: 6 }, () => ["$52", "2026-10-17"]),
    );
  });

  it("still run one Styling at a time on each Consultation, also when two judges press at once", async () => {
    const judge = await signedInJudge();
    const otherJudge = await signedInJudge();
    const consultationId = await start(judge);

    expect(await showMoreOutfits(harness.context(otherJudge), consultationId)).toEqual({ ok: false, refusal: "already-styling" });
    await harness.stylings.runPending();

    const results = await Promise.all([
      showMoreOutfits(harness.context(judge), consultationId),
      changePhotoStyle(harness.context(otherJudge), consultationId, ["edgy"]),
    ]);
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, refusal: "already-styling" });
    expect(harness.stylings.pending).toHaveLength(1);
  });
});

/** A judge's browser, signed in to the Demo Account. */
async function signedInJudge(): Promise<TestBrowser> {
  const judge = new TestBrowser();
  expect(await signIn(harness.context(judge), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  return judge;
}

/** The photo notice agreed to for the Consultation, and when, as it's stored with it. */
async function photoConsentOn(consultationId: string) {
  const [row] = await harness.db
    .select({ acceptedPhotoNoticeVersion: consultation.acceptedPhotoNoticeVersion, photoNoticeAcceptedAt: consultation.photoNoticeAcceptedAt })
    .from(consultation)
    .where(eq(consultation.id, consultationId));
  return row;
}

/** The Demo Account's user ID. */
async function demoAccountId(): Promise<string> {
  return (await readSignedInUser(harness.context(await signedInJudge())))!.id;
}

/** Records `count` Outfits made at `time` by a new user, as if their Stylings had finished then. */
async function outfitsMadeByOthers(count: number, time: string): Promise<void> {
  const user = await readSignedInUser(harness.context(await signedInUser()));
  await recordUsage(harness.db, { kind: "outfit", userId: user!.id, at: new Date(time) }, count);
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, agreeing on the consent sheet, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser) {
  return startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent: BOTH_CONSENT_BOXES_TICKED });
}

/** Starts a Face Photo Consultation, returning its id. Its Styling waits for `runPending()`. */
async function start(browser: TestBrowser): Promise<string> {
  const result = await getMyOutfits(browser);
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** Starts a Face Photo Consultation and runs its Styling to its finish, returning its id. */
async function styleNewConsultation(browser: TestBrowser): Promise<string> {
  const consultationId = await start(browser);
  await harness.stylings.runPending();
  return consultationId;
}

let userCount = 0;

/** A new user, not the Demo Account, signed in, who has verified their email by its link. */
async function signedInUser(): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `demo.other${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `demo_other_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "womenswear",
    countryCode: "US",
    acceptedTerms: true,
  });
  expect(result).toEqual({ ok: true });
  await harness.openEmailedLink(email, browser);
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
