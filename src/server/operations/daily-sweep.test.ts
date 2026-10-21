import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDatabase } from "@/server/db/connect";
import { consultation, emailLog, exchangeRate, qlooCache, usageRecord } from "@/server/db/schema";
import { fawazahmed0Rates, frankfurterRates } from "@/server/exchange-rates/fake";
import { startConsultation } from "@/server/operations/consultations";
import { runDailySweep } from "@/server/operations/daily-sweep";
import { requestPasswordReset } from "@/server/operations/password-reset";
import { readSignedInUser, refreshSession } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createDemoAccount } from "@/server/operations/team";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

const PASSWORD = "a long enough password";

// The harness's team address is team@example.test, so the Demo Account's is its +demo plus-address.
const DEMO_EMAIL = "team+demo@example.test";
const DEMO_PASSWORD = "the judges' shared password";

// The sweep works on every account at once, so each test has a database of its own.
let harness: TestHarness;

beforeEach(async () => {
  harness = await createTestHarness();
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await closeDatabase(harness.db);
});

describe("unverified accounts", () => {
  it("deletes an account still unverified on the date its verification email gave, 7 days after sign-up, freeing its username and email", async () => {
    harness.clock.set("2026-10-16T20:00:00Z");
    const browser = await signedUpUser({ username: "Una.Moss", email: "una@example.com" }, { verified: false });
    const verifiedBrowser = await signedUpUser({ username: "Vic.Lane" });
    expect(harness.emails.to("una@example.com")[0]!.text).toContain("this one will be deleted on 23 October 2026");

    harness.clock.set("2026-10-22T23:59:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Una.Moss" });

    // Earlier in the day than its sign-up, but on the date the email gave.
    harness.clock.set("2026-10-23T12:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    expect(await readSignedInUser(harness.context(verifiedBrowser))).toMatchObject({ username: "Vic.Lane" });
    await signedUpUser({ username: "Una.Moss", email: "una@example.com" });
  });
});

describe("inactive accounts", () => {
  it("warns an account 12 months minus 30 days after it was last active that it goes, with its Consultations, in 30 days unless the user signs in", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    await signedUpUser({ email: "ivy@example.com" });

    harness.clock.set("2027-09-16T11:59:00Z");
    await runDailySweep(harness);
    expect(warningsTo("ivy@example.com")).toEqual([]);

    harness.clock.set("2027-09-16T12:00:00Z");
    await runDailySweep(harness);
    const [warning, ...more] = warningsTo("ivy@example.com");
    expect(more).toEqual([]);
    expect(warning!.subject).toBe("Your Qurator account will be deleted on 16 October 2027");
    expect(warning!.text).toContain("on 16 October 2027, 30 days from now");
    expect(warning!.text).toContain("Consultations");
    expect(warning!.text).toContain("sign in before then:\n\nhttp://localhost:3000/sign-in");
  });

  it("deletes it on the date its warning gave, 30 days later, with every Consultation, photo and Preview, as the user's own deletion does, warning only once", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = await signedUpUser({ username: "Jo.Reed", email: "jo@example.com" });
    const { id } = (await readSignedInUser(harness.context(browser)))!;
    await start(browser);
    await harness.stylings.runPending();
    expect(harness.blob.objects.size).toBe(3);

    harness.clock.set("2027-09-16T12:30:00Z");
    await runDailySweep(harness);
    expect(warningsTo("jo@example.com")[0]!.subject).toBe("Your Qurator account will be deleted on 16 October 2027");
    harness.clock.set("2027-10-15T23:59:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Jo.Reed" });
    expect(warningsTo("jo@example.com")).toHaveLength(1);

    // Earlier in the day than the warning went, but on the date it gave.
    harness.clock.set("2027-10-16T12:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    expect(await harness.db.select().from(consultation).where(eq(consultation.userId, id))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    await signedUpUser({ username: "Jo.Reed", email: "jo@example.com" });
  });

  it("keeps an account signed in to after its warning, warning it again 12 months minus 30 days after that sign-in", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    await signedUpUser({ username: "Kai.Holt", email: "kai@example.com" });
    harness.clock.set("2027-09-16T12:00:00Z");
    await runDailySweep(harness);
    expect(warningsTo("kai@example.com")).toHaveLength(1);

    harness.clock.set("2027-09-20T12:00:00Z");
    const browser = new TestBrowser();
    expect(await signIn(harness.context(browser), { identifier: "Kai.Holt", password: PASSWORD })).toEqual({ ok: true });
    harness.clock.set("2027-10-16T12:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Kai.Holt" });

    harness.clock.set("2028-08-21T11:59:00Z");
    await runDailySweep(harness);
    expect(warningsTo("kai@example.com")).toHaveLength(1);
    harness.clock.set("2028-08-21T12:00:00Z");
    await runDailySweep(harness);
    expect(warningsTo("kai@example.com")).toHaveLength(2);
    expect(warningsTo("kai@example.com")[1]!.subject).toBe("Your Qurator account will be deleted on 20 September 2028");
  });

  it("counts using the app as activity, which refreshes the session at most once a day", async () => {
    // Better Auth keeps session time with Date itself, so Date moves too while the session ages.
    vi.useFakeTimers({ toFake: ["Date"] });
    setTime("2026-10-16T12:00:00Z");
    const browser = await signedUpUser({ email: "lee@example.com" });
    setTime("2026-10-18T12:00:00Z");
    await refreshSession(harness.context(browser));
    vi.useRealTimers();

    harness.clock.set("2027-09-16T12:00:00Z");
    await runDailySweep(harness);
    expect(warningsTo("lee@example.com")).toEqual([]);
    harness.clock.set("2027-09-18T12:00:00Z");
    await runDailySweep(harness);
    expect(warningsTo("lee@example.com")).toHaveLength(1);
  });

  it("sends at most 50 warnings a day, the longest inactive first, recording each only once it's sent, so the rest go the next day and count from then", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const mae = await signedUpUser({ username: "Mae.Dunn", email: "mae@example.com" });
    harness.clock.set("2026-10-16T12:05:00Z");
    const ned = await signedUpUser({ username: "Ned.Cole", email: "ned@example.com" });
    harness.clock.set("2027-09-16T13:00:00Z");
    for (let sent = 0; sent < 49; sent += 1) {
      await harness.emailSender.send({ kind: "inactivity-warning", userId: null, to: `earlier${sent}@example.com`, subject: "Earlier", text: "" });
    }

    await runDailySweep(harness);
    expect(warningsTo("mae@example.com")).toHaveLength(1);
    expect(warningsTo("ned@example.com")).toEqual([]);
    harness.clock.set("2027-09-17T13:00:00Z");
    await runDailySweep(harness);
    expect(warningsTo("ned@example.com").map(({ subject }) => subject)).toEqual([
      "Your Qurator account will be deleted on 17 October 2027",
    ]);

    harness.clock.set("2027-10-16T13:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(mae))).toBeNull();
    expect(await readSignedInUser(harness.context(ned))).toMatchObject({ username: "Ned.Cole" });
    harness.clock.set("2027-10-17T13:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(ned))).toBeNull();
  });

  it("records no warning whose email fails, going on to the next and trying again at the next sweep", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const oli = await signedUpUser({ username: "Oli.Shaw", email: "oli@example.com" });
    harness.clock.set("2026-10-16T12:05:00Z");
    await signedUpUser({ email: "pia@example.com" });
    harness.clock.set("2027-09-16T12:05:00Z");
    harness.emails.refusedRecipients.add("oli@example.com");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runDailySweep(harness)).toMatchObject({ inactivityWarningsSent: 1, failures: 1 });
    expect(warningsTo("pia@example.com")).toHaveLength(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("oli");
    harness.emails.refusedRecipients.clear();
    harness.clock.set("2027-09-17T12:05:00Z");
    await runDailySweep(harness);
    expect(warningsTo("oli@example.com").map(({ subject }) => subject)).toEqual([
      "Your Qurator account will be deleted on 17 October 2027",
    ]);
    harness.clock.set("2027-10-16T12:05:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(oli))).toMatchObject({ username: "Oli.Shaw" });
  });

  it("counts no warning for an account signed in to while its email was on its way", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    await signedUpUser({ username: "Sol.Bray", email: "sol@example.com" });
    harness.clock.set("2027-09-16T12:00:00Z");
    const browser = new TestBrowser();
    harness.emails.duringSend = async () => {
      expect(await signIn(harness.context(browser), { identifier: "Sol.Bray", password: PASSWORD })).toEqual({ ok: true });
    };

    await runDailySweep(harness);
    harness.emails.duringSend = undefined;
    expect(warningsTo("sol@example.com")).toHaveLength(1);

    harness.clock.set("2027-10-16T12:00:00Z");
    await runDailySweep(harness);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Sol.Bray" });
  });

  it("keeps an account signed in to while the sweep was deleting others", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const tia = await signedUpUser({ username: "Tia.Wren" });
    // Its Styling never ran, so deleting the account cancels its Workflow run: the moment Uma signs in.
    await start(tia);
    harness.clock.set("2026-10-16T12:05:00Z");
    const uma = new TestBrowser();
    await signedUpUser({ username: "Uma.Frost" });
    harness.clock.set("2027-09-16T12:30:00Z");
    expect(await runDailySweep(harness)).toMatchObject({ inactivityWarningsSent: 2 });
    harness.clock.set("2027-10-16T12:00:00Z");
    harness.stylings.duringCancel = async () => {
      expect(await signIn(harness.context(uma), { identifier: "Uma.Frost", password: PASSWORD })).toEqual({ ok: true });
    };

    expect(await runDailySweep(harness)).toMatchObject({ inactiveAccountsDeleted: 1 });
    expect(await readSignedInUser(harness.context(tia))).toBeNull();
    expect(await readSignedInUser(harness.context(uma))).toMatchObject({ username: "Uma.Frost" });
  });

  it("goes on past an account it can't delete, which stays until a later sweep can", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const pat = await signedUpUser({ username: "Pat.Rowe", email: "pat@example.com" });
    await start(pat);
    await harness.stylings.runPending();
    const quin = await signedUpUser({ email: "quin@example.com" });
    harness.clock.set("2027-09-16T12:00:00Z");
    await runDailySweep(harness);
    harness.clock.set("2027-10-16T12:00:00Z");
    harness.blob.deleteFolderFails = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runDailySweep(harness)).toMatchObject({ inactiveAccountsDeleted: 1, failures: 1 });
    expect(await readSignedInUser(harness.context(pat))).toMatchObject({ username: "Pat.Rowe" });
    expect(await readSignedInUser(harness.context(quin))).toBeNull();
    expect(JSON.stringify(errors.mock.calls)).not.toContain("pat");

    harness.blob.deleteFolderFails = false;
    harness.clock.set("2027-10-17T12:00:00Z");
    expect(await runDailySweep(harness)).toMatchObject({ inactiveAccountsDeleted: 1, failures: 0 });
    expect(await readSignedInUser(harness.context(pat))).toBeNull();
    expect(harness.blob.objects.size).toBe(0);
  });
});

describe("the Demo Account", () => {
  it("is never warned or deleted, however long it goes unused", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    expect(await createDemoAccount(harness.context(new TestBrowser()), { password: DEMO_PASSWORD })).toEqual({ ok: true });

    for (const time of ["2027-09-16T12:00:00Z", "2027-10-16T12:00:00Z", "2028-10-16T12:00:00Z"]) {
      harness.clock.set(time);
      await runDailySweep(harness);
    }

    expect(warningsTo(DEMO_EMAIL)).toEqual([]);
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  });

  it("isn't deleted as unverified either", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    await createDemoAccount(harness.context(new TestBrowser()), { password: DEMO_PASSWORD });
    // The team's script verifies it at once, so only a slip by hand could leave it unverified.
    const { internalAdapter } = await harness.auth.$context;
    const demo = await internalAdapter.findUserByEmail(DEMO_EMAIL);
    await internalAdapter.updateUser(demo!.user.id, { emailVerified: false });

    harness.clock.set("2026-10-30T12:00:00Z");
    await runDailySweep(harness);

    expect(await signIn(harness.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  });
});

describe("purges", () => {
  it("purges usage records and email-log rows older than 35 days, and Qloo cache entries older than 30 days", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = await signedUpUser({ email: "rae@example.com" });
    await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-11-01T12:00:00Z");
    await start(browser);
    await harness.stylings.runPending();
    await requestPasswordReset(harness.context(new TestBrowser()), { email: "rae@example.com" });
    const october = new Date("2026-10-16T12:00:00Z");
    const november = new Date("2026-11-01T12:00:00Z");
    // A photo check and two Outfits each time; the verification email, then the reset.
    expect(await usageTimes()).toEqual([october, october, october, november, november, november]);
    expect(await emailLogTimes()).toEqual([october, november]);
    expect(await qlooCacheTimes()).toEqual([october]);

    harness.clock.set("2026-11-15T12:00:00Z");
    await runDailySweep(harness);
    expect(await qlooCacheTimes()).toEqual([october]);
    harness.clock.set("2026-11-15T12:01:00Z");
    await runDailySweep(harness);
    expect(await qlooCacheTimes()).toEqual([]);

    harness.clock.set("2026-11-20T12:00:00Z");
    await runDailySweep(harness);
    expect(await usageTimes()).toHaveLength(6);
    expect(await emailLogTimes()).toHaveLength(2);
    harness.clock.set("2026-11-20T12:01:00Z");
    expect(await runDailySweep(harness)).toMatchObject({ usageRecordsPurged: 3, emailLogRowsPurged: 1, qlooCacheEntriesPurged: 0 });
    expect(await usageTimes()).toEqual([november, november, november]);
    expect(await emailLogTimes()).toEqual([november]);
  });
});

describe("exchange rates", () => {
  it("are refreshed from Frankfurter: each currency's rate to the US dollar, with when it was fetched", async () => {
    harness.clock.set("2026-10-21T12:00:00Z");
    harness.exchangeRates.respond = (url) => (url.hostname === "api.frankfurter.dev" ? frankfurterRates({ EUR: 0.89166, IDR: 17986, USD: 1 }) : notFound());

    expect(await runDailySweep(harness)).toMatchObject({ exchangeRatesFrom: "frankfurter" });

    const fetchedAt = new Date("2026-10-21T12:00:00Z");
    expect(await storedRates()).toEqual([
      { currency: "EUR", ratePerUsd: 0.89166, fetchedAt },
      { currency: "IDR", ratePerUsd: 17986, fetchedAt },
      { currency: "USD", ratePerUsd: 1, fetchedAt },
    ]);
    expect(harness.exchangeRates.requests.map(({ url }) => url.href)).toEqual(["https://api.frankfurter.dev/v2/rates?base=USD"]);
  });

  it("replace the day before's, keeping any currency the day's source leaves out", async () => {
    harness.clock.set("2026-10-20T12:00:00Z");
    harness.exchangeRates.respond = () => frankfurterRates({ EUR: 0.89, IDR: 17900 });
    await runDailySweep(harness);
    harness.clock.set("2026-10-21T12:00:00Z");
    harness.exchangeRates.respond = () => frankfurterRates({ EUR: 0.89166 });

    await runDailySweep(harness);

    expect(await storedRates()).toEqual([
      { currency: "EUR", ratePerUsd: 0.89166, fetchedAt: new Date("2026-10-21T12:00:00Z") },
      { currency: "IDR", ratePerUsd: 17900, fetchedAt: new Date("2026-10-20T12:00:00Z") },
    ]);
  });

  it.each([
    ["answers with an error", () => new Response("Service unavailable", { status: 503 })],
    ["can't be reached", () => Promise.reject(new TypeError("fetch failed"))],
    ["answers with something that isn't its rates", () => Response.json({ message: "Not found" })],
  ])("fall back to fawazahmed0's currency API when Frankfurter %s", async (_, frankfurter) => {
    harness.clock.set("2026-10-21T12:00:00Z");
    harness.exchangeRates.respond = (url) =>
      url.hostname === "api.frankfurter.dev" ? frankfurter() : fawazahmed0Rates({ eur: 0.88999126, idr: 17989.00401192, usd: 1 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await runDailySweep(harness)).toMatchObject({ exchangeRatesFrom: "fawazahmed0" });

    const fetchedAt = new Date("2026-10-21T12:00:00Z");
    expect(await storedRates()).toEqual([
      { currency: "EUR", ratePerUsd: 0.88999126, fetchedAt },
      { currency: "IDR", ratePerUsd: 17989.00401192, fetchedAt },
      { currency: "USD", ratePerUsd: 1, fetchedAt },
    ]);
    expect(harness.exchangeRates.requests.map(({ url }) => url.href)).toEqual([
      "https://api.frankfurter.dev/v2/rates?base=USD",
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    ]);
  });

  it("keep the day before's when both sources fail, and say so", async () => {
    harness.clock.set("2026-10-20T12:00:00Z");
    harness.exchangeRates.respond = () => frankfurterRates({ EUR: 0.89 });
    await runDailySweep(harness);
    harness.clock.set("2026-10-21T12:00:00Z");
    harness.exchangeRates.respond = () => new Response("Bad gateway", { status: 502 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runDailySweep(harness)).toMatchObject({ exchangeRatesFrom: null });

    expect(await storedRates()).toEqual([{ currency: "EUR", ratePerUsd: 0.89, fetchedAt: new Date("2026-10-20T12:00:00Z") }]);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("are fetched with nothing about any user: a plain request for every currency's rates", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = await signedUpUser({ username: "Vee.Lark", email: "vee@example.com", countryCode: "ID" });
    await start(browser);
    await harness.stylings.runPending();
    harness.exchangeRates.respond = (url) => (url.hostname === "api.frankfurter.dev" ? notFound() : fawazahmed0Rates({ idr: 17989 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runDailySweep(harness);

    // The same two addresses whoever the users are, asked with no body and no headers.
    expect(harness.exchangeRates.requests.map(({ url }) => url.href)).toEqual([
      "https://api.frankfurter.dev/v2/rates?base=USD",
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    ]);
    for (const request of harness.exchangeRates.requests) {
      expect(request.method).toBe("GET");
      expect(request.body).toBe("");
      expect([...request.headers.keys()]).toEqual([]);
    }
  });
});

/** Sets the clock and, while a test fakes it, Date. */
function setTime(time: string): void {
  vi.setSystemTime(new Date(time));
  harness.clock.set(time);
}

let userCount = 0;

/** A new user, signed in, who has verified their email by its link unless told otherwise. */
async function signedUpUser(overrides: Partial<SignUpInput> = {}, { verified = true } = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const input: SignUpInput = {
    birthDate: { day: "14", month: "6", year: "1994" },
    username: `sweep_user_${userCount}`,
    email: `sweep.user${userCount}@example.com`,
    password: PASSWORD,
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
  expect(await signUp(harness.context(browser), input)).toEqual({ ok: true });
  if (verified) await harness.openEmailedLink(input.email, browser);
  return browser;
}

/** Starts a Face Photo Consultation, agreeing on the consent sheet. Its Styling waits for `runPending()`. */
async function start(browser: TestBrowser): Promise<void> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  const result = await startConsultation(harness.context(browser), {
    photo: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    photoType: "face",
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
}

async function usageTimes(): Promise<Date[]> {
  const rows = await harness.db.select({ at: usageRecord.usedAt }).from(usageRecord).orderBy(asc(usageRecord.usedAt));
  return rows.map(({ at }) => at);
}

async function emailLogTimes(): Promise<Date[]> {
  const rows = await harness.db.select({ at: emailLog.sentAt }).from(emailLog).orderBy(asc(emailLog.sentAt));
  return rows.map(({ at }) => at);
}

async function qlooCacheTimes(): Promise<Date[]> {
  const rows = await harness.db.select({ at: qlooCache.fetchedAt }).from(qlooCache).orderBy(asc(qlooCache.fetchedAt));
  return rows.map(({ at }) => at);
}

/** Every stored exchange rate, by currency. */
function storedRates() {
  return harness.db.select().from(exchangeRate).orderBy(asc(exchangeRate.currency));
}

/** A rate source that doesn't have what was asked for. */
function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/** The inactivity warnings sent to this address, oldest first. */
function warningsTo(address: string) {
  return harness.emails.to(address).filter(({ subject }) => subject.startsWith("Your Qurator account will be deleted"));
}
