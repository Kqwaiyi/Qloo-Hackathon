import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readEmailVerification } from "@/server/operations/email-verification";
import { requestPasswordReset, resetPassword } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

afterEach(() => {
  vi.useRealTimers();
});

const HOUR_MS = 60 * 60 * 1000;

describe("asking for a reset link", () => {
  it("gives the same reply whether or not an account uses the address, emailing only the account", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "ava@example.com" }));

    const known = await requestPasswordReset(harness.context(new TestBrowser()), "ava@example.com");
    const unknown = await requestPasswordReset(harness.context(new TestBrowser()), "nobody@example.com");

    expect(known).toEqual({ ok: true });
    expect(unknown).toEqual(known);
    expect(resetEmailsTo("ava@example.com")).toHaveLength(1);
    expect(harness.emails.to("nobody@example.com")).toEqual([]);
  });

  it("emails a link to the reset page that lasts 1 hour, saying nothing changes if the user didn't ask", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "ben@example.com" }));

    await requestPasswordReset(harness.context(new TestBrowser()), "ben@example.com");

    const [reset] = resetEmailsTo("ben@example.com");
    expect(reset!.text).toContain("The link works for 1 hour.");
    expect(reset!.text).toContain("Didn't ask for this? Ignore this email and nothing changes.");
    const opened = await harness.openEmailedLink("ben@example.com", new TestBrowser());
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=\w+$/);
  });

  it("sends an account 3 reset emails in 24 hours, answering a fourth request just the same without sending", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "jo@example.com" }));

    for (let request = 0; request < 4; request += 1) {
      expect(await requestPasswordReset(harness.context(new TestBrowser()), "jo@example.com")).toEqual({ ok: true });
    }

    expect(resetEmailsTo("jo@example.com")).toHaveLength(3);
    harness.clock.set("2026-10-17T12:00:01Z");
    await requestPasswordReset(harness.context(new TestBrowser()), "jo@example.com");
    expect(resetEmailsTo("jo@example.com")).toHaveLength(4);
  });

  it("says emails are paused, to every address alike, once 450 emails went out in 24 hours", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "kai@example.com" }));
    harness.clock.set("2026-12-01T09:00:00Z");
    for (let index = 0; index < 450; index += 1) {
      await harness.emailSender.send({ kind: "password-changed", userId: null, to: `x${index}@example.com`, subject: "S", text: "T" });
    }

    const known = await requestPasswordReset(harness.context(new TestBrowser()), "kai@example.com");
    const unknown = await requestPasswordReset(harness.context(new TestBrowser()), "nobody@example.com");

    expect(known).toEqual({ ok: false, refusal: "emails-paused" });
    expect(unknown).toEqual(known);
    expect(resetEmailsTo("kai@example.com")).toEqual([]);
  });

  it("refuses a malformed address", async () => {
    expect(await requestPasswordReset(harness.context(new TestBrowser()), "not an address")).toEqual({ ok: false, refusal: "invalid-email" });
  });

  it("asks a browser sending too many requests to wait, whatever the address", async () => {
    const limited = await createTestHarness({ rateLimit: true });
    const browser = new TestBrowser({ ip: "203.0.113.9" });
    for (let request = 0; request < 3; request += 1) {
      expect(await requestPasswordReset(limited.context(browser), `someone${request}@example.com`)).toEqual({ ok: true });
    }

    const fourth = await requestPasswordReset(limited.context(browser), "someone3@example.com");

    expect(fourth).toEqual({ ok: false, refusal: "rate-limited" });
  });
});

describe("the reset link", () => {
  // Better Auth times its links with the real clock, so these tests move Date itself.
  it("still works just before 1 hour is up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "hal@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "hal@example.com");
    vi.setSystemTime(Date.now() + HOUR_MS - 60_000);

    const result = await resetPassword(harness.context(new TestBrowser()), {
      token: await openResetLink("hal@example.com"),
      newPassword: "the new password",
    });

    expect(result).toEqual({ ok: true });
  });

  it("has expired after 1 hour: it lands on the reset page with an error, and can't reset", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Ivy.Cole", email: "ivy@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "ivy@example.com");
    const token = new URL(harness.linkEmailedTo("ivy@example.com")).pathname.split("/").at(-1)!;
    vi.setSystemTime(Date.now() + HOUR_MS + 60_000);

    const opened = await harness.openEmailedLink("ivy@example.com", new TestBrowser());
    const result = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "the new password" });

    expect(opened.headers.get("location")).toBe("http://localhost:3000/reset-password?error=INVALID_TOKEN");
    expect(result).toEqual({ ok: false, refusal: "invalid-link" });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ivy.Cole", password: "the old password" })).toEqual({ ok: true });
  });
});

describe("completing a reset", () => {
  it("sets the new password, so the user signs in with it and no longer with the old one", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Cleo.Ray", email: "cleo@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "cleo@example.com");
    const token = await openResetLink("cleo@example.com");

    const result = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "the new password" });

    expect(result).toEqual({ ok: true });
    const withNew = await signIn(harness.context(new TestBrowser()), { identifier: "Cleo.Ray", password: "the new password" });
    const withOld = await signIn(harness.context(new TestBrowser()), { identifier: "Cleo.Ray", password: "the old password" });
    expect(withNew).toEqual({ ok: true });
    expect(withOld).toEqual({ ok: false, refusal: "credentials-mismatch" });
  });

  it("takes a new password of 8 to 128 characters, keeping the link for another try after one that isn't", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Lee.Park", email: "lee@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "lee@example.com");
    const token = await openResetLink("lee@example.com");

    const tooShort = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "7 chars" });
    const tooLong = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "x".repeat(129) });
    const longest = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "x".repeat(128) });

    expect(tooShort).toEqual({ ok: false, refusal: "invalid-password" });
    expect(tooLong).toEqual({ ok: false, refusal: "invalid-password" });
    expect(longest).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Lee.Park", password: "x".repeat(128) })).toEqual({ ok: true });
  });

  it("signs the user out on every device, the one they reset on included", async () => {
    const laptop = new TestBrowser();
    const phone = new TestBrowser();
    await signUp(harness.context(laptop), signUpInput({ username: "Dev.Shah", email: "dev@example.com" }));
    await signIn(harness.context(phone), { identifier: "Dev.Shah", password: "the old password" });
    await requestPasswordReset(harness.context(phone), "dev@example.com");
    const token = await openResetLink("dev@example.com");

    await resetPassword(harness.context(phone), { token, newPassword: "the new password" });

    expect(await readSignedInUser(harness.context(laptop))).toBeNull();
    expect(await readSignedInUser(harness.context(phone))).toBeNull();
  });

  it("marks an unverified user's email verified, since the link proved they get its mail", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Eve.Lin", email: "eve@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "eve@example.com");
    const token = await openResetLink("eve@example.com");

    await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "the new password" });

    const browser = new TestBrowser();
    await signIn(harness.context(browser), { identifier: "Eve.Lin", password: "the new password" });
    expect(await readEmailVerification(harness.context(browser))).toEqual({ verified: true });
  });

  it("cancels the user's other reset links, and the one used, leaving other users' links working", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Fay.Moss", email: "fay@example.com" }));
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "gus@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "gus@example.com");
    await requestPasswordReset(harness.context(new TestBrowser()), "fay@example.com");
    const older = await openResetLink("fay@example.com");
    await requestPasswordReset(harness.context(new TestBrowser()), "fay@example.com");
    const newer = await openResetLink("fay@example.com");

    await resetPassword(harness.context(new TestBrowser()), { token: newer, newPassword: "the new password" });

    for (const token of [older, newer]) {
      const again = await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "someone else's password" });
      expect(again).toEqual({ ok: false, refusal: "invalid-link" });
    }
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Fay.Moss", password: "the new password" })).toEqual({ ok: true });
    const gus = await resetPassword(harness.context(new TestBrowser()), { token: await openResetLink("gus@example.com"), newPassword: "gus's new password" });
    expect(gus).toEqual({ ok: true });
  });
});

describe("Better Auth's endpoints, called directly", () => {
  it("answer a reset request for an unknown address just as for an account's", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "max@example.com" }));

    const known = await harness.postToAuth("/request-password-reset", { email: "max@example.com" }, new TestBrowser());
    const unknown = await harness.postToAuth("/request-password-reset", { email: "nobody@example.com" }, new TestBrowser());

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("count a server API request towards the account's 3 reset emails", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "ned@example.com" }));
    for (let request = 0; request < 3; request += 1) await harness.auth.api.requestPasswordReset({ body: { email: "ned@example.com" } });

    await requestPasswordReset(harness.context(new TestBrowser()), "ned@example.com");

    expect(resetEmailsTo("ned@example.com")).toHaveLength(3);
  });

  it("have a reset's side effects too: the email verified and the other links cancelled", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Olive.Ng", email: "olive@example.com" }));
    await requestPasswordReset(harness.context(new TestBrowser()), "olive@example.com");
    const older = await openResetLink("olive@example.com");
    await requestPasswordReset(harness.context(new TestBrowser()), "olive@example.com");
    const newer = await openResetLink("olive@example.com");

    const direct = await harness.postToAuth("/reset-password", { token: newer, newPassword: "the new password" }, new TestBrowser());

    expect(direct.status).toBe(200);
    expect(await resetPassword(harness.context(new TestBrowser()), { token: older, newPassword: "another password" })).toEqual({
      ok: false,
      refusal: "invalid-link",
    });
    const browser = new TestBrowser();
    await signIn(harness.context(browser), { identifier: "Olive.Ng", password: "the new password" });
    expect(await readEmailVerification(harness.context(browser))).toEqual({ verified: true });
  });
});

/** The reset emails sent to this address, oldest first. */
function resetEmailsTo(address: string) {
  return harness.emails.to(address).filter((email) => email.subject === "Reset your Outfit Recommender password");
}

/** Opens the newest link emailed to this address, as the user would, and reads the token the reset page gets. */
async function openResetLink(address: string): Promise<string> {
  const opened = await harness.openEmailedLink(address, new TestBrowser());
  const token = new URL(opened.headers.get("location") ?? "", "http://localhost:3000").searchParams.get("token");
  if (!token) throw new Error(`The link emailed to ${address} didn't reach the reset page with a token.`);
  return token;
}

let userCount = 0;

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `user_${userCount}`,
    email: `user${userCount}@example.com`,
    password: "the old password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  };
}
