import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { qlooCache, usageRecord, user } from "@/server/db/schema";
import { deleteConsultation, listConsultations, readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { readSignUpGate, signUp, type SignUpInput } from "@/server/operations/sign-up";
import { readStylingStatus } from "@/server/operations/stylings";
import { readUsageSummary } from "@/server/operations/usage";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { recordUsage } from "@/server/usage/records";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.blob.objects.clear();
  harness.ai.photoCheckCount = 0;
  harness.stylings.pending.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  await harness.db.delete(qlooCache);
  // The app-wide caps count every user's Outfits, so each test starts with none made.
  await harness.db.delete(usageRecord);
});

describe("the region gate at sign-up", () => {
  it("closes the sign-up page, before anything is filled in, to a visitor in a country Gemini doesn't serve", async () => {
    const closed = readSignUpGate(harness.context(new TestBrowser({ ipCountry: "CN" })));
    const open = readSignUpGate(harness.context(new TestBrowser({ ipCountry: "GB" })));

    expect(closed).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(open).toEqual({ ok: true });
  });

  it("refuses a sign-up from a country Gemini doesn't serve, storing nothing", async () => {
    const browser = new TestBrowser({ ipCountry: "RU" });

    const result = await signUp(harness.context(browser), signUpInput({ email: "far.away@example.com" }));

    expect(result).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(browser.hasSessionCookie()).toBe(false);
    expect(await harness.db.select().from(user).where(eq(user.email, "far.away@example.com"))).toEqual([]);
    expect(harness.emails.to("far.away@example.com")).toEqual([]);
  });

  it("refuses a direct call to Better Auth's sign-up endpoint from there too", async () => {
    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "direct.far@example.com" }),
      new TestBrowser({ ipCountry: "IR" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_REGION" });
    expect(await harness.db.select().from(user).where(eq(user.email, "direct.far@example.com"))).toEqual([]);
  });

  it("checks the age first, so an under-18 date there still blocks the browser", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser({ ipCountry: "RU" });

    const result = await signUp(harness.context(browser), signUpInput({ birthDate: { day: "1", month: "1", year: "2010" } }));

    expect(result).toEqual({ ok: false, refusal: "under-18" });
    expect(browser.cookie("age_gate")).toBeDefined();
    expect(readSignUpGate(harness.context(browser))).toEqual({ ok: false, refusal: "under-18" });
  });
});

describe("the region gate on a new Consultation", () => {
  it("refuses \"Get my Outfits\" from a country Gemini doesn't serve before the photo is checked, storing nothing", async () => {
    const browser = await signedInUser();
    browser.ipCountry = "BY";

    const result = await getMyOutfits(browser);

    expect(result).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });
});

describe("the region gate in the shared start check", () => {
  it("tells New Consultation, through the usage summary, that no Styling can start from a country Gemini doesn't serve", async () => {
    const browser = await signedInUser();
    browser.ipCountry = "KP";

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 10,
      moreOutfitsFrom: null,
      stylingStart: { ok: false, refusal: "unsupported-region" },
    });
  });

  it("comes before every limit, since it doesn't lift at a time", async () => {
    const browser = await signedInUser();
    const signedIn = await readSignedInUser(harness.context(browser));
    await recordUsage(harness.db, { kind: "outfit", userId: signedIn!.id, at: harness.clock.now() }, 10);
    browser.ipCountry = "SY";

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      stylingStart: { ok: false, refusal: "unsupported-region" },
    });
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "unsupported-region" });
  });

  it("comes after verification, as in the order of checks", async () => {
    const browser = await signedInUser({ verified: false });
    browser.ipCountry = "CU";

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      stylingStart: { ok: false, refusal: "unverified" },
    });
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "unverified" });
  });
});

describe.each([
  { from: "a request without the country header, as in local development", ipCountry: undefined },
  { from: "a country Gemini serves", ipCountry: "GB" },
])("the region gate for $from", ({ ipCountry }) => {
  it("lets the visitor sign up", async () => {
    const browser = new TestBrowser({ ipCountry });

    expect(readSignUpGate(harness.context(browser))).toEqual({ ok: true });
    expect(await signUp(harness.context(browser), signUpInput())).toEqual({ ok: true });
  });

  it("lets a Styling start, and \"Get my Outfits\" go ahead", async () => {
    const browser = await signedInUser();
    browser.ipCountry = ipCountry;

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
    expect(await getMyOutfits(browser)).toMatchObject({ ok: true });
  });
});

describe("what the region gate never checks", () => {
  it("lets a user sign in, read their Consultations and delete one from a country Gemini doesn't serve", async () => {
    const input = signUpInput();
    const browser = await signedInUser({ input });
    const started = await getMyOutfits(browser);
    if (!started.ok) throw new Error(`Couldn't start a Consultation: ${started.refusal}`);
    await harness.stylings.runPending();
    const travelling = new TestBrowser({ ipCountry: "RU" });

    const signedIn = await signIn(harness.context(travelling), { identifier: input.email, password: input.password });

    expect(signedIn).toEqual({ ok: true });
    expect(await listConsultations(harness.context(travelling))).toMatchObject([{ id: started.consultationId, outfitCount: 2 }]);
    expect(await readConsultation(harness.context(travelling), started.consultationId)).toMatchObject({ outfits: [{}, {}] });
    expect(await readStylingStatus(harness.context(travelling), started.consultationId)).toMatchObject({ state: "ready" });
    expect(await deleteConsultation(harness.context(travelling), started.consultationId)).toEqual({ ok: true });
    expect(await listConsultations(harness.context(travelling))).toEqual([]);
  });
});

let userCount = 0;

/**
 * A new user, signed up with `input` from a request without the country header and signed in, who
 * has verified their email by its link unless told otherwise.
 */
async function signedInUser({ input = signUpInput(), verified = true } = {}): Promise<TestBrowser> {
  const browser = new TestBrowser();
  expect(await signUp(harness.context(browser), input)).toEqual({ ok: true });
  if (verified) await harness.openEmailedLink(input.email, browser);
  return browser;
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser) {
  return startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face" });
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

/** What a script calling Better Auth's sign-up endpoint itself would send. */
function signUpBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  userCount += 1;
  const username = `region_direct_${userCount}`;
  return {
    name: username,
    username,
    displayUsername: username,
    email: `${username}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    birthDate: "1990-05-17",
    ...overrides,
  };
}

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "3", month: "8", year: "1995" },
    username: `region_user_${userCount}`,
    email: `region.user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
}
