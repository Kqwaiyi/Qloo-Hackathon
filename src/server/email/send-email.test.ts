import { gte } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { EmailKind } from "@/config/email";
import { emailLog } from "@/server/db/schema";
import { readSignedInUser } from "@/server/operations/session";
import { signUp } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

const HOUR_MS = 60 * 60 * 1000;

let harness: TestHarness;
let ava: string;
let ben: string;
// Each test starts two days after the last, so no email from an earlier test is in its 24 hours.
let start = new Date("2026-11-01T09:00:00Z");

beforeAll(async () => {
  harness = await createTestHarness();
  ava = await signedUpUserId("ava");
  ben = await signedUpUserId("ben");
});

beforeEach(() => {
  start = new Date(start.getTime() + 48 * HOUR_MS);
  harness.clock.set(start);
  harness.emails.messages.length = 0;
  harness.emails.failWith = undefined;
});

describe("the send-email function", () => {
  it("sends a plain-text email from Outfit Recommender and logs its kind, user and time, never the address", async () => {
    const result = await harness.emailSender.send({
      kind: "password-reset",
      userId: ava,
      to: "ava@example.com",
      subject: "Reset your password",
      text: "Here's your link.",
    });

    expect(result).toEqual({ sent: true });
    expect(harness.emails.messages).toEqual([
      { fromName: "Outfit Recommender", to: "ava@example.com", subject: "Reset your password", text: "Here's your link." },
    ]);
    expect(await harness.db.select().from(emailLog).where(gte(emailLog.sentAt, start))).toEqual([
      { id: expect.any(String), kind: "password-reset", userId: ava, sentAt: start },
    ]);
  });

  it("stops every send at 450 in 24 hours, resets included, until the oldest leave the 24 hours", async () => {
    await sendMany(449, "password-changed");
    harness.clock.set(new Date(start.getTime() + HOUR_MS));
    expect(await send("password-reset", ava)).toEqual({ sent: true });

    expect(await send("password-reset", ben)).toEqual({ sent: false, refusal: "emails-paused" });
    expect(await send("password-changed", ben)).toEqual({ sent: false, refusal: "emails-paused" });
    harness.clock.set(new Date(start.getTime() + 24 * HOUR_MS));
    expect(await send("password-reset", ben)).toEqual({ sent: true });
  });

  it("stops sign-up emails once 300 emails of any kind went out in 24 hours, while other emails still go", async () => {
    await sendMany(299, "password-changed");
    expect(await send("verification", ava)).toEqual({ sent: true });

    expect(await send("verification", ben)).toEqual({ sent: false, refusal: "sign-ups-paused" });
    expect(await send("password-reset", ben)).toEqual({ sent: true });
  });

  it.each([
    ["verification-resend", 5],
    ["password-reset", 3],
    ["email-change", 3],
    ["email-change-verification", 3],
  ] as const)("lets each account have %s emails %i times in 24 hours", async (kind, cap) => {
    for (let sent = 0; sent < cap; sent += 1) expect(await send(kind, ava)).toEqual({ sent: true });

    expect(await send(kind, ava)).toEqual({ sent: false, refusal: "account-limit" });
    expect(await send(kind, ben)).toEqual({ sent: true });
    harness.clock.set(new Date(start.getTime() + 24 * HOUR_MS));
    expect(await send(kind, ava)).toEqual({ sent: true });
  });

  it("sends at most 50 inactivity warnings in 24 hours", async () => {
    await sendMany(50, "inactivity-warning");

    expect(await send("inactivity-warning", ben)).toEqual({ sent: false, refusal: "warnings-paused" });
    expect(await send("password-reset", ben)).toEqual({ sent: true });
  });

  it("doesn't count an email the transport failed to send, and keeps the address out of the error", async () => {
    harness.emails.failWith = new Error("550 No such user: ava@example.com");

    const failed = send("password-reset", ava);

    await expect(failed).rejects.toThrow("The password-reset email couldn't be sent.");
    await expect(failed).rejects.not.toThrow("ava@example.com");
    harness.emails.failWith = undefined;
    for (let sent = 0; sent < 3; sent += 1) expect(await send("password-reset", ava)).toEqual({ sent: true });
  });
});

function send(kind: EmailKind, userId: string | null) {
  return harness.emailSender.send({ kind, userId, to: "someone@example.com", subject: "Subject", text: "Text" });
}

/** Sends this many emails of the kind, each to a different address and none for an account. */
async function sendMany(count: number, kind: EmailKind): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const result = await harness.emailSender.send({ kind, userId: null, to: `user${index}@example.com`, subject: "Subject", text: "Text" });
    expect(result).toEqual({ sent: true });
  }
}

async function signedUpUserId(username: string): Promise<string> {
  const browser = new TestBrowser();
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username,
    email: `${username}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
  });
  expect(result).toEqual({ ok: true });
  return (await readSignedInUser(harness.context(browser)))!.id;
}
