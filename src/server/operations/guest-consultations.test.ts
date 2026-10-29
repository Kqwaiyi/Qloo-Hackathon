import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
import { consultation, qlooCache, qlooLimitState, usageRecord, user } from "@/server/db/schema";
import { deleteConsultation, listConsultations, readConsultation } from "@/server/operations/consultations";
import { readGuestPage, type StartGuestConsultationInput, startGuestConsultation } from "@/server/operations/guest-consultations";
import { readSignUpGate } from "@/server/operations/sign-up";
import { readStylingStatus } from "@/server/operations/stylings";
import { readUsageSummary } from "@/server/operations/usage";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { saveQlooLimitState } from "@/server/qloo/limit-state";
import { recordProductSearches } from "@/server/usage/records";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

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
  harness.ai.stylistRequests.length = 0;
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  await harness.db.delete(qlooCache);
  // The app-wide caps count every user's Outfits, Guests' included, so each test starts with none made.
  await harness.db.delete(usageRecord);
  await harness.db.delete(qlooLimitState);
  guestUsersBefore = await harness.db.$count(user, eq(user.isGuest, true));
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

  it("is opened by the guest cookie alone, HTTP-only and valid for an hour, so another browser can neither follow nor open it", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    const otherBrowser = new TestBrowser({ ipCountry: "GB" });
    const consultationId = consultationIdOf(await startGuestConsultation(harness.context(guest), await guestInput()));

    expect(guest.cookie("guest")).toMatchObject({ httpOnly: true, maxAge: 60 * 60, path: "/" });
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

    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "guest-consultation", consultationId });
    await harness.stylings.runPending();
    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "guest-consultation", consultationId });
    expect(await readGuestPage(harness.context(new TestBrowser({ ipCountry: "GB" })))).toEqual({ show: "new-consultation", countryCode: "GB" });
  });

  it("opens on the New Consultation steps again once the guest cookie is an hour old", async () => {
    const guest = new TestBrowser({ ipCountry: "GB" });
    await startGuestConsultation(harness.context(guest), await guestInput());
    await harness.stylings.runPending();

    harness.clock.set("2026-10-16T13:00:00Z");

    expect(await readGuestPage(harness.context(guest))).toEqual({ show: "new-consultation", countryCode: "GB" });
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
    const first = new TestBrowser({ ipCountry: "GB" });
    const second = new TestBrowser({ ipCountry: "GB" });

    consultationIdOf(await startGuestConsultation(harness.context(first), await guestInput()));
    await harness.stylings.runPending();
    const secondId = consultationIdOf(await startGuestConsultation(harness.context(second), await guestInput()));
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(second), secondId))!.outfits).toHaveLength(1);
    expect(await startGuestConsultation(harness.context(new TestBrowser({ ipCountry: "GB" })), await guestInput())).toEqual({
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

/** Records `count` Outfits shown at `time` by others, as if by accounts since deleted, whose records hold no user. */
async function outfitsMadeByOthers(count: number, time: string): Promise<void> {
  await harness.db
    .insert(usageRecord)
    .values(Array.from({ length: count }, () => ({ id: randomUUID(), kind: "outfit" as const, userId: null, usedAt: new Date(time) })));
}

/** What "Get my Outfits" sends from the Guest Page with every field filled in, a Face Photo unless it says. */
async function guestInput(overrides: Partial<StartGuestConsultationInput> = {}): Promise<StartGuestConsultationInput> {
  return {
    photo: await jpeg(),
    photoType: "face",
    birthDate: { day: "2", month: "2", year: "1992" },
    stylePreference: "womenswear",
    countryCode: "GB",
    consent: BOTH_CONSENT_BOXES_TICKED,
    acceptedTerms: true,
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
