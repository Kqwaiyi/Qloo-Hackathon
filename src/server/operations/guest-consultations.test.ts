import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_CHECK_TIMEOUT_MS, PHOTO_NOTICE_VERSION } from "@/config/accounts";
import { guestPlaceholderAddress } from "@/config/guests";
import { GUEST_PHOTO_CHECK_LIMIT } from "@/config/limits";
import { AGE_GATE_COOKIE } from "@/server/accounts/age-gate";
import { deleteAccountOf } from "@/server/accounts/deletion";
import { consultation, guestUsageRecord, outfit, qlooCache, qlooLimitState, usageRecord, user } from "@/server/db/schema";
import { deleteConsultation, listConsultations, readConsultation } from "@/server/operations/consultations";
import {
  clearDeletedGuestCookie,
  readGuestPage,
  type StartGuestConsultationInput,
  startGuestConsultation,
} from "@/server/operations/guest-consultations";
import { requestPasswordReset } from "@/server/operations/password-reset";
import { readSignUpGate } from "@/server/operations/sign-up";
import { changeBudgetTier, changePhotoStyle, readStylingStatus, showMoreOutfits, tryAgain } from "@/server/operations/stylings";
import { readUsageSummary } from "@/server/operations/usage";
import { qlooBrand, qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { saveQlooLimitState } from "@/server/qloo/limit-state";
import { recordGuestUsage } from "@/server/usage/guest-records";
import { recordProductSearches } from "@/server/usage/records";
import {
  BOTH_CONSENT_BOXES_TICKED,
  createTestHarness,
  TEST_BOT_CHECK_SECRET,
  TEST_BOT_CHECK_TOKEN,
  TestBrowser,
  type TestHarness,
} from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];
// Made-up Brands, shaped like Qloo's Brand entities, that every Style Icon's fans favour: enough for
// a body photo's Outfits, and 10, so the pool isn't thin.
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180] }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120] }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear", "sneakers"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel", "outerwear"], affinity: 0.9 }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
  qlooBrand("b-ember", "Ember", { categories: ["apparel"], affinity: 0.85, price: [15, 60] }),
  qlooBrand("b-pace", "Pace", { categories: ["footwear"], affinity: 0.8, price: [30, 70] }),
  qlooBrand("b-hem", "Hem", { categories: ["apparel"], affinity: 0.7, price: [25, 80] }),
  qlooBrand("b-loom", "Loom", { categories: ["apparel"], affinity: 0.65, price: [30, 90] }),
  qlooBrand("b-weft", "Weft", { categories: ["apparel"], affinity: 0.6, price: [20, 70] }),
];

let harness: TestHarness;
/** The guest users there were as the test started. */
let guestUsersBefore = 0;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.ai.photoCheckCount = 0;
  harness.ai.stylistTurn = undefined;
  harness.ai.duringCall = undefined;
  harness.ai.stylistRequests.length = 0;
  harness.stylings.pending.length = 0;
  harness.afterResponse.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  harness.turnstile.requests.length = 0;
  harness.turnstile.answer = "pass";
  await harness.db.delete(qlooCache);
  // The app-wide caps count every user's Outfits, Guests' included, so each test starts with none made.
  await harness.db.delete(usageRecord);
  await harness.db.delete(qlooLimitState);
  // Every test browser without an address of its own has the same one, which gets one Guest
  // Consultation a day, so each test starts with no Guest Consultation, running or counted.
  await harness.db.delete(user).where(eq(user.isGuest, true));
  await harness.db.delete(guestUsageRecord);
  guestUsersBefore = await harness.db.$count(user, eq(user.isGuest, true));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a Guest Consultation", () => {
  it("starts with every field given, and its Styling runs to two Outfits with Previews, which the Guest's browser can read", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    const started = await startGuestConsultation(harness.context(guest), await guestInput());

    expect(started).toEqual({ ok: true, consultationId: expect.any(String) });
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(guest), consultationIdOf(started))).toMatchObject({
      state: "ready",
      outfits: [{ preview: { state: "ready" } }, { preview: { state: "ready" } }],
    });
  });

  it("is opened by the guest cookie alone, HTTP-only, so another browser can neither follow nor open it", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const otherBrowser = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    expect(guest.cookie("guest")).toMatchObject({ httpOnly: true, path: "/" });
    expect(await readStylingStatus(harness.context(guest), consultationId)).toMatchObject({ state: "styling", progress: { kind: "first" } });
    expect(await readStylingStatus(harness.context(otherBrowser), consultationId)).toBeNull();
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(otherBrowser), consultationId)).toBeNull();
  });

  it("can't be opened once the guest cookie is an hour old, even by a browser that kept it", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();

    harness.clock.set("2026-10-16T12:59:59Z");
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({ state: "ready" });
    harness.clock.set("2026-10-16T13:00:00Z");
    expect(await readConsultation(harness.context(guest), consultationId)).toBeNull();
  });

  it("can't be opened with a guest cookie the app didn't sign", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    const [guestUserId, expiresAt] = guest.cookie("guest")!.value.split(".");
    const forger = new TestBrowser({ ipCountry: "GB" });
    forger.responseCookies.set({ name: "guest", value: `${guestUserId}.${expiresAt}.not-our-signature`, path: "/" });

    expect(await readStylingStatus(harness.context(forger), consultationId)).toBeNull();
  });

  it("gives the guest cookie nothing else: no My Consultations, no usage summary, no deleting", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();

    expect(await listConsultations(harness.context(guest))).toEqual([]);
    expect(await readUsageSummary(harness.context(guest))).toBeNull();
    expect(await deleteConsultation(harness.context(guest), consultationId)).toEqual({ ok: false, refusal: "signed-out" });
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({ state: "ready" });
  });
});

describe("once a Guest's Outfits are shown", () => {
  it("the Guest reads it as a Guest Consultation", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({ state: "ready", isGuestConsultation: true });
  });

  it.each<{ restyling: string; start: (guest: TestBrowser, consultationId: string) => Promise<object> }>([
    { restyling: '"Show 2 more Outfits"', start: (guest, consultationId) => showMoreOutfits(harness.context(guest), consultationId) },
    { restyling: "a Budget Tier change", start: (guest, consultationId) => changeBudgetTier(harness.context(guest), consultationId, "expensive") },
    { restyling: "a Photo Style change", start: (guest, consultationId) => changePhotoStyle(harness.context(guest), consultationId, ["edgy"]) },
  ])("refuses $restyling with the guest refusal, starting no Styling and keeping the two Outfits", async ({ start }) => {
    // A Body-Only Photo's, with Style Icons left over, so a signed-in owner could have each of them.
    harness.qloo.respond = qlooAnsweringWithBrands();
    const guest = new TestBrowser({ ipCountry: "US" });
    const consultationId = consultationIdOf(
      await startGuestConsultation(harness.context(guest), await guestInput({ photoType: "body_only", budgetTier: "medium", countryCode: "US" })),
    );
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({ budgetTier: "medium", everyOutfitBuilt: false });

    expect(await start(guest, consultationId)).toEqual({ ok: false, refusal: "guest" });
    expect(harness.stylings.pending).toHaveLength(0);
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      state: "ready",
      budgetTier: "medium",
      photoStyle: ["casual"],
      outfits: [{ position: 1 }, { position: 2 }],
    });
  });
});

describe("a Guest Consultation whose Styling made no Outfit", () => {
  it("can be tried again once its Styling broke, and then shows its two Outfits", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      state: "no_outfits",
      outfits: [],
      failedStyling: { kind: "first", reason: "something_broke" },
    });
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    harness.clock.set("2026-10-16T12:05:00Z");

    expect(await tryAgain(harness.context(guest), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      state: "ready",
      failedStyling: null,
      outfits: [{ position: 1 }, { position: 2 }],
    });
  });

  it("recovers from a stuck Styling as anyone's does: the Guest's Styling status poll finishes it as broken, for Try again", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    harness.clock.set("2026-10-16T12:10:00Z");

    expect(await readStylingStatus(harness.context(guest), consultationId)).toEqual({ state: "no_outfits", progress: null });
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      failedStyling: { kind: "first", reason: "something_broke" },
    });
    // Its Workflow run is cancelled, so it builds nothing.
    await harness.stylings.runPending();
    expect(await tryAgain(harness.context(guest), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1 }, { position: 2 }],
    });
  });
});

describe("starting a Guest Consultation", () => {
  it.each<{ missing: string; input: Partial<StartGuestConsultationInput>; refusal: object }>([
    { missing: "the date of birth", input: { birthDate: { day: "", month: "", year: "" } }, refusal: { refusal: "invalid", field: "birthDate" } },
    { missing: "a real date of birth", input: { birthDate: { day: "30", month: "2", year: "1992" } }, refusal: { refusal: "invalid", field: "birthDate" } },
    { missing: "the Style Preference", input: { stylePreference: "" }, refusal: { refusal: "invalid", field: "stylePreference" } },
    { missing: "the Country", input: { countryCode: "" }, refusal: { refusal: "invalid", field: "countryCode" } },
    { missing: "a Country on the Country list", input: { countryCode: "CN" }, refusal: { refusal: "invalid", field: "countryCode" } },
    { missing: "photo consent", input: { consent: undefined }, refusal: { refusal: "photo-consent-needed" } },
    {
      missing: "the consent to storing and processing the photo",
      input: { consent: { storeAndProcess: false, sendToAiProviders: true } },
      refusal: { refusal: "photo-consent-needed" },
    },
    {
      missing: "the consent to sending the photo to the AI providers",
      input: { consent: { storeAndProcess: true, sendToAiProviders: false } },
      refusal: { refusal: "photo-consent-needed" },
    },
    { missing: "the Terms agreement", input: { acceptedTerms: false }, refusal: { refusal: "terms-not-accepted" } },
  ])("is refused without $missing, before the photo is checked, storing nothing", async ({ input, refusal }) => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    expect(await startGuestConsultation(harness.context(guest), await guestInput(input))).toEqual({ ok: false, ...refusal });
    await expectNothingStoredFor(guest);
  });
});

describe("the Guest Page", () => {
  it("opens on the New Consultation steps without a guest cookie, the Country filled in from the IP address's when it's on the list", async () => {
    expect(await readGuestPage(harness.context(new TestBrowser({ ipCountry: "GB" })))).toEqual({ show: "new-consultation", countryCode: "GB" });
    expect(await readGuestPage(harness.context(new TestBrowser()))).toEqual({ show: "new-consultation", countryCode: null });
  });

  it("opens on the Guest Consultation, running or finished, for the browser holding its guest cookie, and only for it", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "guest-consultation", consultationId, usage: expect.any(Object) });
    await harness.stylings.runPending();
    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "guest-consultation", consultationId, usage: expect.any(Object) });
    const elsewhere = new TestBrowser({ ip: "198.51.100.20", ipCountry: "GB" });
    expect(await readGuestPage(harness.context(elsewhere))).toEqual({ show: "new-consultation", countryCode: "GB" });
  });

  it("says whether a Guest Consultation whose Styling broke can be tried again, or why not, with no Outfit Allowance to count", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();

    expect(await readGuestPage(harness.context(guest))).toEqual({
      show: "guest-consultation",
      consultationId,
      usage: { outfitsLeft: null, moreOutfitsFrom: null, stylingStart: { ok: true, outfitsWanted: 2 } },
    });
    await outfitsMadeByOthers(100, "2026-10-16T09:00:00Z");
    expect(await readGuestPage(harness.context(guest))).toMatchObject({
      show: "guest-consultation",
      usage: { stylingStart: { ok: false, refusal: "app-wide-24-hour-cap" } },
    });
  });

  it("tells a Guest back after the hour that their Guest Consultation has been deleted, over the address's used-up limit, until the cookie is cleared", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    await harness.stylings.runPending();
    // The browser keeps it a day, past its hour, so the page can say so.
    expect(guest.cookie("guest")).toMatchObject({ maxAge: 24 * 60 * 60 });

    harness.clock.set("2026-10-16T13:00:00Z");

    const usedUp = { show: "used-up", refusal: { refusal: "guest-consultation-used", moreFrom: new Date("2026-10-17T12:00:00Z") } };
    expect(await readGuestPage(harness.context(guest))).toEqual({ ...usedUp, guestConsultationDeleted: true });
    await clearDeletedGuestCookie(harness.context(guest));
    expect(guest.cookie("guest")).toBeUndefined();
    expect(await readGuestPage(harness.context(guest))).toEqual(usedUp);
  });

  it("tells them so over the New Consultation steps when the address can have another", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const guest = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    await harness.stylings.runPending();

    harness.clock.set("2026-10-16T13:00:00Z");

    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "new-consultation", countryCode: "GB", guestConsultationDeleted: true });
  });

  it("treats a guest cookie whose guest user is gone within the hour as absent, saying its Guest Consultation has been deleted", async () => {
    const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();
    const [guestUserId] = guest.cookie("guest")!.value.split(".");
    await deleteAccountOf(harness, guestUserId!);

    expect(await readConsultation(harness.context(guest), consultationId)).toBeNull();
    expect(await readGuestPage(harness.context(guest))).toMatchObject({ show: "used-up", guestConsultationDeleted: true });
    await clearDeletedGuestCookie(harness.context(guest));
    expect(guest.cookie("guest")).toBeUndefined();
  });

  it("keeps a guest cookie that still opens its Guest Consultation, and says nothing was deleted without one of ours", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    const forger = new TestBrowser({ ip: "198.51.100.30", ipCountry: "GB" });
    forger.responseCookies.set({ name: "guest", value: `${randomUUID()}.${Date.parse("2026-10-16T13:00:00Z")}.not-our-signature`, path: "/" });

    await clearDeletedGuestCookie(harness.context(guest));

    expect(await readGuestPage(harness.context(guest))).toMatchObject({ show: "guest-consultation" });
    expect(await readGuestPage(harness.context(forger))).toEqual({ show: "new-consultation", countryCode: "GB" });
  });

  it("is closed, saying why, to a browser the age gate has blocked, to a country Gemini doesn't serve, and while a cap stops every Styling", async () => {
    const blocked = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(blocked), await guestInput({ birthDate: { day: "18", month: "10", year: "2008" } }));

    expect(await readGuestPage(harness.context(blocked))).toEqual({ show: "closed", refusal: { refusal: "under-18" } });
    expect(await readGuestPage(harness.context(new TestBrowser({ ipCountry: "RU" })))).toEqual({
      show: "closed",
      refusal: { refusal: "unsupported-region" },
    });
    await outfitsMadeByOthers(100, "2026-10-16T09:00:00Z");
    expect(await readGuestPage(harness.context(new TestBrowser({ ipCountry: "GB" })))).toEqual({
      show: "closed",
      refusal: { refusal: "app-wide-24-hour-cap" },
    });
  });

  it("stays closed to a browser the age gate has blocked on an address that's used up, offering it no account it can't have", async () => {
    await guestConsultationShownOn("203.0.113.7");
    // Blocked as an under-18 date of birth at sign-up, or on the Guest Page before, would block it.
    const blocked = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    blocked.responseCookies.set(AGE_GATE_COOKIE);
    expect(readSignUpGate(harness.context(blocked))).toEqual({ ok: false, refusal: "under-18" });

    expect(await readGuestPage(harness.context(blocked))).toEqual({ show: "closed", refusal: { refusal: "under-18" } });
  });
});

describe("a Guest's photo", () => {
  it("is checked as anyone's is, and a rejected one is refused with the same reason, keeping nothing", async () => {
    harness.ai.scenario = "unclear-main-person";
    const guest = new TestBrowser({ ipCountry: "GB" });

    expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({
      ok: false,
      refusal: "photo-rejected",
      rejection: { reason: "unclear-main-person" },
    });
    expect(harness.ai.photoCheckCount).toBe(1);
    expect(harness.blob.objects.size).toBe(0);
    expect(await harness.db.$count(user, eq(user.isGuest, true))).toBe(guestUsersBefore);
    expect(guest.cookie("guest")).toBeUndefined();
  });
});

describe("what stops every Styling", () => {
  it("refuses a Guest Consultation from a country Gemini doesn't serve, before anything else, storing nothing", async () => {
    const guest = new TestBrowser({ ipCountry: "RU" });

    const refused = await startGuestConsultation(harness.context(guest), await guestInput({ birthDate: { day: "18", month: "10", year: "2008" } }));

    expect(refused).toEqual({ ok: false, refusal: "unsupported-region" });
    await expectNothingStoredFor(guest);
    expect(guest.cookie("age_gate")).toBeUndefined();
  });

  it.each([
    {
      limit: "the app-wide 24-hour cap",
      reach: () => outfitsMadeByOthers(100, "2026-10-16T09:00:00Z"),
      refusal: { refusal: "app-wide-24-hour-cap" },
    },
    {
      limit: "the app-wide monthly cap",
      reach: () => outfitsMadeByOthers(750, "2026-10-05T09:00:00Z"),
      refusal: { refusal: "app-wide-monthly-cap", backOn: new Date("2026-11-01T00:00:00Z") },
    },
    {
      limit: "the Qloo backstop",
      reach: () => saveQlooLimitState(harness.db, { remainingCalls: 999, resetsAt: new Date("2026-11-13T00:00:00Z"), observedAt: harness.clock.now() }),
      refusal: { refusal: "qloo-backstop", backOn: new Date("2026-11-13T00:00:00Z") },
    },
    {
      limit: "the product-search backstop",
      reach: () => recordProductSearches(harness.db, new Date("2026-10-05T09:00:00Z"), 4977),
      refusal: { refusal: "product-search-backstop", backOn: new Date("2026-11-01T00:00:00Z") },
    },
  ])("refuses a Guest Consultation while $limit stops everyone's Stylings, before the photo is checked, storing nothing", async ({ reach, refusal }) => {
    await reach();
    const guest = new TestBrowser({ ipCountry: "GB" });

    expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({ ok: false, ...refusal });
    await expectNothingStoredFor(guest);
  });
});

describe("a Guest's Styling", () => {
  it("counts its Outfits toward the app-wide caps, which hold a Guest to the Outfits they leave", async () => {
    await outfitsMadeByOthers(97, "2026-10-16T09:00:00Z");
    // Each on an address of its own, which the daily limit would otherwise hold to one.
    const first = new TestBrowser({ ip: "198.51.100.1", ipCountry: "GB" });
    const second = new TestBrowser({ ip: "198.51.100.2", ipCountry: "GB" });

    consultationIdOf(await startGuestConsultation(harness.context(first), await guestInput()));
    await harness.stylings.runPending();
    const secondId = consultationIdOf(await startGuestConsultation(harness.context(second), await guestInput()));
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(second), secondId))!.outfits).toHaveLength(1);
    expect(await startGuestConsultation(harness.context(new TestBrowser({ ip: "198.51.100.3", ipCountry: "GB" })), await guestInput())).toEqual({
      ok: false,
      refusal: "app-wide-24-hour-cap",
    });
  });

  it("has everyone's 30 turns, not the Demo Account's 60, and finishes with the Outfits it saved once they're used up", async () => {
    // It saves Ava Stone's Outfit, then keeps asking for its Style Icons again, never finishing.
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2 ? { calls: [{ tool: "saveOutfit", input: hairstyleOutfit(1) }] } : turn > 2 ? { calls: [{ tool: "findStyleIcons", input: {} }] } : undefined;
    const guest = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.map(({ turn }) => turn)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1, styleIconName: "Ava Stone" }],
    });
  });

  it("is styled for the details the Guest gave: their Country, age group and Style Preference", async () => {
    const guest = new TestBrowser({ ipCountry: "FR" });

    await startGuestConsultation(
      harness.context(guest),
      await guestInput({ countryCode: "GB", stylePreference: "menswear", birthDate: { day: "9", month: "3", year: "1990" } }),
    );
    await harness.stylings.runPending();

    const asked = harness.qloo.requests.map(({ url }) => url.searchParams);
    expect(asked).not.toHaveLength(0);
    for (const params of asked) {
      expect(params.get("signal.location.query")).toBe("United Kingdom");
      expect(params.get("signal.demographics.age")).toBe("35_to_44");
      expect(params.get("signal.demographics.gender")).toBe("male");
    }
  });
});

describe("the Guest's agreements", () => {
  it("are kept on the Guest Consultation: the photo notice, with the Terms, agreed to as \"Get my Outfits\" was pressed", async () => {
    harness.clock.set("2026-10-16T12:34:56Z");
    const guest = new TestBrowser({ ipCountry: "GB" });

    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    const [agreed] = await harness.db
      .select({ acceptedPhotoNoticeVersion: consultation.acceptedPhotoNoticeVersion, photoNoticeAcceptedAt: consultation.photoNoticeAcceptedAt })
      .from(consultation)
      .where(eq(consultation.id, consultationId));
    expect(agreed).toEqual({ acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: new Date("2026-10-16T12:34:56Z") });
  });
});

describe("the age gate on the Guest Page", () => {
  it("refuses an under-18 date of birth before the photo is checked, storing nothing, and blocks the browser as sign-up does", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    const refused = await startGuestConsultation(harness.context(guest), await guestInput({ birthDate: { day: "18", month: "10", year: "2008" } }));

    expect(refused).toEqual({ ok: false, refusal: "under-18" });
    await expectNothingStoredFor(guest);
    expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({ ok: false, refusal: "under-18" });
    expect(readSignUpGate(harness.context(guest))).toEqual({ ok: false, refusal: "under-18" });
  });

  it("refuses a date of birth whose 18th birthday has begun somewhere but not everywhere, without blocking the browser", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    const refused = await startGuestConsultation(harness.context(guest), await guestInput({ birthDate: { day: "17", month: "10", year: "2008" } }));

    expect(refused).toEqual({ ok: false, refusal: "under-18" });
    await expectNothingStoredFor(guest);
    expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it("lets in someone who is 18 everywhere", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    const started = await startGuestConsultation(harness.context(guest), await guestInput({ birthDate: { day: "16", month: "10", year: "2008" } }));

    expect(started).toEqual({ ok: true, consultationId: expect.any(String) });
  });
});

describe("the daily limit by internet address", () => {
  it("counts a Guest Consultation once its first Outfit is shown, then refuses another browser on that address until 24 hours after", async () => {
    const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    harness.clock.set("2026-10-16T12:03:00Z");
    await harness.stylings.runPending();

    const otherBrowser = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const used = { refusal: "guest-consultation-used", moreFrom: new Date("2026-10-17T12:03:00Z") };
    expect(await readGuestPage(harness.context(otherBrowser))).toEqual({ show: "used-up", refusal: used });
    expect(await startGuestConsultation(harness.context(otherBrowser), await guestInput())).toEqual({ ok: false, ...used });
    // Refused before its photo is checked, so only the first Guest's was.
    expect(harness.ai.photoCheckCount).toBe(1);
    expect(otherBrowser.cookie("guest")).toBeUndefined();
  });

  it("lets a Guest on another address have theirs", async () => {
    await guestConsultationShownOn("203.0.113.7");

    const elsewhere = new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" });

    expect(await readGuestPage(harness.context(elsewhere))).toEqual({ show: "new-consultation", countryCode: "GB" });
    expect(await startGuestConsultation(harness.context(elsewhere), await guestInput())).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it("lets the address have another once 24 hours have passed since its Guest Consultation was counted", async () => {
    await guestConsultationShownOn("203.0.113.7");
    const nextDay = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    harness.clock.set("2026-10-17T11:59:59Z");
    expect(await startGuestConsultation(harness.context(nextDay), await guestInput())).toMatchObject({ ok: false, refusal: "guest-consultation-used" });
    harness.clock.set("2026-10-17T12:00:00Z");
    expect(await readGuestPage(harness.context(nextDay))).toEqual({ show: "new-consultation", countryCode: "GB" });
    expect(await startGuestConsultation(harness.context(nextDay), await guestInput())).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it("holds the address to one at a time: another is refused while the first's Styling runs, before either is counted", async () => {
    const first = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    await startGuestConsultation(harness.context(first), await guestInput());
    const second = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    const running = { refusal: "guest-consultation-running" };
    expect(await readGuestPage(harness.context(second))).toEqual({ show: "used-up", refusal: running });
    expect(await startGuestConsultation(harness.context(second), await guestInput())).toEqual({ ok: false, ...running });
    expect(harness.ai.photoCheckCount).toBe(1);
    expect(second.cookie("guest")).toBeUndefined();
  });

  it("holds two presses of \"Get my Outfits\" at once from the address to one: both get past the checks, but only one starts", async () => {
    // Each photo check waits for the other's to begin, so both requests have been checked before either creates anything.
    let checking = 0;
    let bothChecking!: () => void;
    const both = new Promise<void>((resolve) => (bothChecking = resolve));
    harness.ai.duringCall = async (call) => {
      if (call !== "checkPhoto") return;
      if (++checking === 2) bothChecking();
      await both;
    };
    const tabs = [new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" }), new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" })];

    const results = await Promise.all(tabs.map(async (tab) => startGuestConsultation(harness.context(tab), await guestInput())));

    expect(results).toEqual(
      expect.arrayContaining([{ ok: true, consultationId: expect.any(String) }, { ok: false, refusal: "guest-consultation-running" }]),
    );
    expect(await harness.db.$count(user, eq(user.isGuest, true))).toBe(1);
    expect(harness.blob.objects.size).toBe(1);
  });

  it("isn't held by a Styling that's stuck, which the stuck check finishes first", async () => {
    await startGuestConsultation(harness.context(new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" })), await guestInput());

    harness.clock.set("2026-10-16T12:10:00Z");
    const second = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    expect(await startGuestConsultation(harness.context(second), await guestInput())).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it("counts a Guest Consultation whose first Outfits a Try again showed, once they're shown", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    harness.clock.set("2026-10-16T12:05:00Z");

    expect(await tryAgain(harness.context(guest), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    expect(await readGuestPage(harness.context(new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" })))).toEqual({
      show: "used-up",
      refusal: { refusal: "guest-consultation-used", moreFrom: new Date("2026-10-17T12:05:00Z") },
    });
  });

  it("isn't used up by a Guest Consultation whose Styling made no Outfit", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    await guestConsultationShownOn("203.0.113.7");
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const second = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    expect(await readGuestPage(harness.context(second))).toEqual({ show: "new-consultation", countryCode: "GB" });
    const secondId = consultationIdOf(await startGuestConsultation(harness.context(second), await guestInput()));
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(second), secondId)).toMatchObject({ state: "ready", outfits: [{ position: 1 }, { position: 2 }] });
  });
});

describe("a Guest's internet address", () => {
  it("is in no row of any table once it has had a photo check and a Guest Consultation counted", async () => {
    harness.ai.scenario = "unclear-main-person";
    await startGuestConsultation(harness.context(new TestBrowser({ ip: "203.0.113.77", ipCountry: "GB" })), await guestInput());
    harness.ai.scenario = "pass";
    await guestConsultationShownOn("203.0.113.77");

    // It was counted, all the same.
    expect(await readGuestPage(harness.context(new TestBrowser({ ip: "203.0.113.77", ipCountry: "GB" })))).toMatchObject({ show: "used-up" });
    expect(await rowsHolding("203.0.113.77")).toEqual([]);
  });

  it("can't be counted without the salt its hash is made under, as on a deployment that has none, so the Guest Page is closed", async () => {
    const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const withoutSalt = { ...harness.context(guest), guestIpSalt: null };

    expect(await readGuestPage(withoutSalt)).toEqual({ show: "closed", refusal: { refusal: "guest-page-unavailable" } });
    expect(await startGuestConsultation(withoutSalt, await guestInput())).toEqual({ ok: false, refusal: "guest-page-unavailable" });
    await expectNothingStoredFor(guest);
  });
});

// The Bot Check (ADR-0006), as sign-up has it: Cloudflare Turnstile, through the harness's fake.
describe("the Bot Check on a Guest's \"Get my Outfits\"", () => {
  it("lets a Guest with a good token start, sending Cloudflare the secret, the form's token and the Guest's IP address", async () => {
    const guest = new TestBrowser({ ip: "203.0.113.9", ipCountry: "GB" });

    const started = await startGuestConsultation(harness.context(guest), await guestInput({ botCheckToken: "form-token" }));

    expect(started).toEqual({ ok: true, consultationId: expect.any(String) });
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "form-token", ip: "203.0.113.9" }]);
  });

  it("refuses a token Cloudflare rejects, before the photo is checked, storing nothing", async () => {
    harness.turnstile.answer = { reject: "timeout-or-duplicate" };
    const guest = new TestBrowser({ ipCountry: "GB" });

    const refused = await startGuestConsultation(harness.context(guest), await guestInput());

    expect(refused).toEqual({ ok: false, refusal: "bot-check-failed" });
    await expectNothingStoredFor(guest);
  });

  it("lets a Guest it refused press \"Get my Outfits\" again, as often as it takes, using up none of the address's photo checks", async () => {
    harness.turnstile.answer = { reject: "invalid-input-response" };
    const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    for (let press = 0; press <= GUEST_PHOTO_CHECK_LIMIT; press++) {
      expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({ ok: false, refusal: "bot-check-failed" });
    }
    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "new-consultation", countryCode: "GB" });
    harness.turnstile.answer = "pass";

    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(guest), consultationId)).toMatchObject({ state: "ready", outfits: [{ position: 1 }, { position: 2 }] });
  });

  it("refuses \"Get my Outfits\" sent without a token, without asking Cloudflare, storing nothing", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });

    const none = await startGuestConsultation(harness.context(guest), await guestInput({ botCheckToken: undefined }));
    const empty = await startGuestConsultation(harness.context(guest), await guestInput({ botCheckToken: "" }));

    expect([none, empty]).toEqual([
      { ok: false, refusal: "bot-check-failed" },
      { ok: false, refusal: "bot-check-failed" },
    ]);
    expect(harness.turnstile.requests).toEqual([]);
    await expectNothingStoredFor(guest);
  });

  it.each([
    { outage: "can't be reached", answer: "unreachable" as const, logged: "network error" },
    { outage: "answers with a server error", answer: "server-error" as const, logged: "Cloudflare answered 500" },
  ])("lets the Guest Consultation start when Cloudflare $outage, and logs it", async ({ answer, logged }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = answer;
    const guest = new TestBrowser({ ipCountry: "GB" });

    const started = await startGuestConsultation(harness.context(guest), await guestInput());

    expect(started).toEqual({ ok: true, consultationId: expect.any(String) });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to start a Guest Consultation through: ${logged}`);
  });

  it("waits up to 5 seconds for Cloudflare, then lets the Guest Consultation start and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "slow";
    const input = await guestInput();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;

    const pending = startGuestConsultation(harness.context(new TestBrowser({ ipCountry: "GB" })), input).finally(() => {
      settled = true;
    });
    // Under fake timers, `vi.waitFor` moves time on by its interval at every check, so this one doesn't.
    await vi.waitFor(() => expect(harness.turnstile.requests).toHaveLength(1), { interval: 0 });
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: true, consultationId: expect.any(String) });
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to start a Guest Consultation through: no answer within 5 seconds");
  });

  it("comes right after the region gate: Cloudflare isn't asked from a country Gemini doesn't serve", async () => {
    const guest = new TestBrowser({ ipCountry: "RU" });

    expect(await startGuestConsultation(harness.context(guest), await guestInput({ botCheckToken: undefined }))).toEqual({
      ok: false,
      refusal: "unsupported-region",
    });
    expect(await startGuestConsultation(harness.context(guest), await guestInput())).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("refuses a bot before the address's daily limit, so it learns nothing of the address", async () => {
    await guestConsultationShownOn("203.0.113.7");
    const bot = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    expect(await startGuestConsultation(harness.context(bot), await guestInput({ botCheckToken: undefined }))).toEqual({
      ok: false,
      refusal: "bot-check-failed",
    });
  });

  it("is off with no Turnstile secret configured, as at sign-up: no token is needed and Cloudflare is never asked", async () => {
    const unconfigured = await createTestHarness({ botCheck: false });

    const started = await startGuestConsultation(unconfigured.context(new TestBrowser({ ipCountry: "GB" })), await guestInput({ botCheckToken: undefined }));

    expect(started).toEqual({ ok: true, consultationId: expect.any(String) });
    expect(unconfigured.turnstile.requests).toEqual([]);
  });
});

describe("a Guest's photo checks", () => {
  it("are 5 an address in any 24 hours, whoever's browser sends them, then refused before the photo is checked, saying when more come", async () => {
    harness.ai.scenario = "unclear-main-person";
    for (const minute of [0, 1, 2, 3, 4]) {
      harness.clock.set(`2026-10-16T12:0${minute}:00Z`);
      const tab = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
      expect(await startGuestConsultation(harness.context(tab), await guestInput())).toMatchObject({ ok: false, refusal: "photo-rejected" });
    }
    harness.clock.set("2026-10-16T12:05:00Z");
    const sixth = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });

    const usedUp = { refusal: "guest-photo-check-limit", moreFrom: new Date("2026-10-17T12:00:00Z") };
    expect(await startGuestConsultation(harness.context(sixth), await guestInput())).toEqual({ ok: false, ...usedUp });
    expect(harness.ai.photoCheckCount).toBe(5);
    expect(await readGuestPage(harness.context(sixth))).toEqual({ show: "used-up", refusal: usedUp });
    expect(await readGuestPage(harness.context(new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" })))).toMatchObject({ show: "new-consultation" });
    harness.clock.set("2026-10-17T12:00:00Z");
    expect(await readGuestPage(harness.context(sixth))).toMatchObject({ show: "new-consultation" });
  });
});

// ADR-0013: a Guest Consultation is kept an hour, then deleted with everything in it.
describe("the guest cleanup", () => {
  it("deletes a Guest Consultation once it's an hour old, with its photo, Previews and guest user, in the background of another Guest opening the Guest Page", async () => {
    const first = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(first), await guestInput()));
    await harness.stylings.runPending();
    // The photo and both Previews.
    expect(harness.blob.objects.size).toBe(3);
    const another = new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" });

    harness.clock.set("2026-10-16T12:59:59Z");
    await readGuestPage(harness.context(another));
    await harness.afterResponse.runPending();
    expect(await guestConsultationsLeft([consultationId])).toEqual([consultationId]);

    harness.clock.set("2026-10-16T13:00:00Z");
    await readGuestPage(harness.context(another));
    // The page didn't wait for it.
    expect(await guestConsultationsLeft([consultationId])).toEqual([consultationId]);
    await harness.afterResponse.runPending();

    expect(await guestConsultationsLeft([consultationId])).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    expect(await harness.db.$count(user, eq(user.isGuest, true))).toBe(guestUsersBefore);
  });

  it.each<{ acting: string; act: (another: TestBrowser) => Promise<unknown> }>([
    { acting: "starts a Guest Consultation", act: async (another) => startGuestConsultation(harness.context(another), await guestInput()) },
    {
      acting: "comes back to their own Guest Consultation",
      act: async (another) => {
        harness.clock.set("2026-10-16T12:30:00Z");
        await startGuestConsultation(harness.context(another), await guestInput());
        // Only what coming back leaves.
        harness.afterResponse.pending.length = 0;
        harness.clock.set("2026-10-16T13:00:00Z");
        expect(await readGuestPage(harness.context(another))).toMatchObject({ show: "guest-consultation" });
      },
    },
  ])("deletes one an hour old in the background of another Guest who $acting", async ({ act }) => {
    const first = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(first), await guestInput()));
    await harness.stylings.runPending();
    const another = new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" });
    harness.clock.set("2026-10-16T13:00:00Z");
    harness.afterResponse.pending.length = 0;

    await act(another);
    await harness.afterResponse.runPending();

    expect(await guestConsultationsLeft([consultationId])).toEqual([]);
  });

  it("keeps one an hour old while its Styling runs, so its Workflow is never broken, and deletes it once the Styling has finished", async () => {
    const first = await guestTryingAgainAt("2026-10-16T12:55:00Z");
    const another = new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" });

    harness.clock.set("2026-10-16T13:00:00Z");
    await readGuestPage(harness.context(another));
    await harness.afterResponse.runPending();
    expect(await guestConsultationsLeft([first])).toEqual([first]);
    await harness.stylings.runPending();
    expect(await outfitsOn(first)).toBe(2);

    harness.clock.set("2026-10-16T13:01:00Z");
    await readGuestPage(harness.context(another));
    await harness.afterResponse.runPending();
    expect(await guestConsultationsLeft([first])).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("deletes one whose Styling is stuck, cancelling its Workflow run first, as the stuck check would finish it", async () => {
    const first = await guestTryingAgainAt("2026-10-16T12:55:00Z");
    const another = new TestBrowser({ ip: "203.0.113.8", ipCountry: "GB" });

    harness.clock.set("2026-10-16T13:05:00Z");
    await readGuestPage(harness.context(another));
    await harness.afterResponse.runPending();

    expect(await guestConsultationsLeft([first])).toEqual([]);
    expect(harness.stylings.pending).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("purges the guest usage records 24 hours old, with the IP hashes they hold, in the background of a Guest opening the Guest Page", async () => {
    await recordGuestUsage(harness.db, { kind: "photo_check", ipHash: "an-address", at: new Date("2026-10-15T12:00:00Z") });
    await recordGuestUsage(harness.db, { kind: "guest_consultation", ipHash: "an-address", at: new Date("2026-10-15T12:00:01Z") });

    await readGuestPage(harness.context(new TestBrowser({ ipCountry: "GB" })));
    expect(await harness.db.$count(guestUsageRecord)).toBe(2);
    await harness.afterResponse.runPending();

    const left = await harness.db.select({ usedAt: guestUsageRecord.usedAt }).from(guestUsageRecord);
    expect(left).toEqual([{ usedAt: new Date("2026-10-15T12:00:01Z") }]);
  });
});

// ADR-0013: a guest user is no account, so nothing built around accounts reaches it.
describe("a guest user", () => {
  it.each<{ request: string; send: (address: string) => Promise<unknown> }>([
    {
      request: "a password reset",
      send: async (address) =>
        expect(await requestPasswordReset(harness.context(new TestBrowser()), { email: address, botCheckToken: TEST_BOT_CHECK_TOKEN })).toEqual({
          ok: true,
        }),
    },
    {
      request: "a new verification link",
      send: async (address) =>
        expect((await harness.postToAuth("/send-verification-email", { email: address }, new TestBrowser())).status).toBe(200),
    },
  ])("is never emailed: $request for its placeholder address is answered as for any address, sending nothing", async ({ send }) => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    const [guestUserId] = guest.cookie("guest")!.value.split(".");
    const address = guestPlaceholderAddress(guestUserId!);

    await send(address);

    expect(harness.emails.to(address)).toEqual([]);
  });
});

/**
 * A Guest Consultation started at noon, from 203.0.113.7, whose first Styling broke, and which the
 * Guest tries again at `time`: its new Styling runs, waiting for `runPending()`.
 */
async function guestTryingAgainAt(time: string): Promise<string> {
  harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
  const guest = new TestBrowser({ ip: "203.0.113.7", ipCountry: "GB" });
  const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));
  await harness.stylings.runPending();
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  harness.clock.set(time);
  expect(await tryAgain(harness.context(guest), consultationId)).toEqual({ ok: true });
  return consultationId;
}

/** How many Outfits the Consultation has. */
async function outfitsOn(consultationId: string): Promise<number> {
  return harness.db.$count(outfit, eq(outfit.consultationId, consultationId));
}

/** Which of these Consultations are still stored. */
async function guestConsultationsLeft(consultationIds: string[]): Promise<string[]> {
  const left = await harness.db.select({ id: consultation.id }).from(consultation).where(inArray(consultation.id, consultationIds));
  return left.map(({ id }) => id);
}

/** A Guest Consultation on this address, its Styling run straight away: its two Outfits shown, unless Qloo fails it. */
async function guestConsultationShownOn(ip: string): Promise<void> {
  consultationIdOf(await startGuestConsultation(harness.context(new TestBrowser({ ip, ipCountry: "GB" })), await guestInput()));
  await harness.stylings.runPending();
}

/** Every row, of every table in the database, that holds `text` anywhere in it, as "<table>: <row>". */
async function rowsHolding(text: string): Promise<string[]> {
  const { rows: tables } = (await harness.db.execute(
    sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  )) as unknown as { rows: { name: string }[] };
  expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(["user", "guest_usage_record", "consultation"]));
  const holding: string[] = [];
  for (const { name } of tables) {
    const { rows } = (await harness.db.execute(sql`select row_to_json(t)::text as row from ${sql.identifier(name)} t`)) as unknown as {
      rows: { row: string }[];
    };
    holding.push(...rows.filter(({ row }) => row.includes(text)).map(({ row }) => `${name}: ${row}`));
  }
  return holding;
}

/** Nothing of a refused "Get my Outfits" was kept: no photo checked or stored, no guest user, no guest cookie. */
async function expectNothingStoredFor(guest: TestBrowser): Promise<void> {
  expect(harness.ai.photoCheckCount).toBe(0);
  expect(harness.blob.objects.size).toBe(0);
  expect(await harness.db.$count(user, eq(user.isGuest, true))).toBe(guestUsersBefore);
  expect(guest.cookie("guest")).toBeUndefined();
}

/** An Outfit as the Stylist saves it: a Hairstyle from Style Icon `styleIcon`. */
function hairstyleOutfit(styleIcon: number) {
  return {
    styleIcon,
    hairstyle: {
      cut: "Soft layered cut",
      details: "A soft layered cut, trimmed to shape from your current length.",
      cutKnown: true,
      why: "A soft cut that carries your casual Photo Style.",
    },
  };
}

/** Qloo answering every person call with STYLE_ICONS, and every Brand call with BRANDS. */
function qlooAnsweringWithBrands() {
  return (request: RecordedQlooRequest) =>
    qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : STYLE_ICONS);
}

/** Records `count` Outfits shown at `time` by others, as if by accounts since deleted, whose records hold no user. */
async function outfitsMadeByOthers(count: number, time: string): Promise<void> {
  await harness.db
    .insert(usageRecord)
    .values(Array.from({ length: count }, () => ({ id: randomUUID(), kind: "outfit" as const, userId: null, usedAt: new Date(time) })));
}

/**
 * What "Get my Outfits" sends from the Guest Page with every field filled in, a Face Photo unless it
 * says, and the token the Bot Check's widget made, which passes unless the test says otherwise.
 */
async function guestInput(overrides: Partial<StartGuestConsultationInput> = {}): Promise<StartGuestConsultationInput> {
  return {
    photo: await jpeg(),
    photoType: "face",
    birthDate: { day: "2", month: "2", year: "1992" },
    stylePreference: "womenswear",
    countryCode: "GB",
    consent: BOTH_CONSENT_BOXES_TICKED,
    acceptedTerms: true,
    botCheckToken: TEST_BOT_CHECK_TOKEN,
    ...overrides,
  };
}

function consultationIdOf(started: Awaited<ReturnType<typeof startGuestConsultation>>): string {
  if (!started.ok) throw new Error(`Couldn't start a Guest Consultation: ${started.refusal}`);
  return started.consultationId;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
