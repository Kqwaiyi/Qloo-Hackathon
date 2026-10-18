import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/server/db/schema";
import { changeEmail, readPendingEmailChange } from "@/server/operations/email-change";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createDemoAccount } from "@/server/operations/team";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// One Gmail inbox, one account: Gmail ignores dots and a +tag in the part before the @, and
// googlemail.com is gmail.com, so every such variant of an address reaches the same inbox.

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

describe("signing up by our form with an address reaching the Gmail inbox of an existing account", () => {
  it("is refused as taken, creating no account and sending no email", async () => {
    await signedUpUser({ email: "ava.stone@gmail.com" });

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "avastone@gmail.com" }));

    expect(result).toEqual({ ok: false, refusal: "email-taken" });
    expect(await harness.db.select().from(user).where(eq(user.email, "avastone@gmail.com"))).toEqual([]);
    expect(harness.emails.to("avastone@gmail.com")).toEqual([]);
  });

  it("is refused as taken with a +tag added, everything after the first + ignored", async () => {
    await signedUpUser({ email: "ben.marsh@gmail.com" });

    for (const email of ["ben.marsh+outfits@gmail.com", "benmarsh+style+2026@gmail.com"]) {
      const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email }));

      expect(result, email).toEqual({ ok: false, refusal: "email-taken" });
      expect(harness.emails.to(email)).toEqual([]);
    }
  });

  it("is refused as taken at googlemail.com for an account at gmail.com, and the other way round, in any case", async () => {
    await signedUpUser({ email: "cleo.hart@gmail.com" });
    await signedUpUser({ email: "dan.reed@googlemail.com" });

    for (const email of ["Cleo.Hart@GoogleMail.com", "DanReed+x@GMAIL.com"]) {
      const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email }));

      expect(result, email).toEqual({ ok: false, refusal: "email-taken" });
      expect(await harness.db.select().from(user).where(eq(user.email, email.toLowerCase()))).toEqual([]);
    }
  });

  it("lets a different Gmail inbox sign up, even one only a letter or a digit away", async () => {
    await signedUpUser({ email: "eve.long@gmail.com" });

    for (const email of ["eve.longe@gmail.com", "evelong1@googlemail.com", "eve.long@gmail.co"]) {
      expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email })), email).toEqual({ ok: true });
    }
  });
});

describe("signing up at Better Auth's sign-up endpoint, called directly, with an address reaching the Gmail inbox of an existing account", () => {
  it("gets the answer the existing account's own address gets, creating no account", async () => {
    await signedUpUser({ email: "hal.berg@gmail.com" });
    const exact = await harness.postToAuth("/sign-up/email", signUpBody({ email: "hal.berg@gmail.com" }), new TestBrowser());
    const taken = { status: exact.status, body: await exact.json() };

    for (const email of ["halberg@gmail.com", "h.a.l.b.e.r.g+script@googlemail.com"]) {
      const response = await harness.postToAuth("/sign-up/email", signUpBody({ email }), new TestBrowser());

      expect({ status: response.status, body: await response.json() }, email).toEqual(taken);
      expect(await harness.db.select().from(user).where(eq(user.email, email))).toEqual([]);
      expect(harness.emails.to(email)).toEqual([]);
    }
    expect(taken).toMatchObject({ status: 422, body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" } });
  });

  it("lets a different Gmail inbox through", async () => {
    await signedUpUser({ email: "ian.cole@gmail.com" });

    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "ian.coles@gmail.com" }), new TestBrowser());

    expect(response.status).toBe(200);
  });
});

describe("changing an account's email by our form to an address reaching another account's Gmail inbox", () => {
  it("is answered for a verified user as an address already in use is, sending and changing nothing", async () => {
    await signedUpUser({ email: "jo.park@gmail.com" });
    const browser = await signedUpUser({ email: "kim@example.com", verified: true });

    const result = await changeEmail(harness.context(browser), "Jo.Park+new@googlemail.com");

    expect(result).toEqual({ ok: true, awaiting: "approval" });
    expect(harness.emails.to("kim@example.com")).toHaveLength(1);
    expect(harness.emails.to("jo.park+new@googlemail.com")).toEqual([]);
    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "kim@example.com", emailVerified: true });
  });

  it("is answered for an unverified user, whose change would happen at once, as an address already in use is, changing nothing", async () => {
    await signedUpUser({ email: "lou.ford@googlemail.com" });
    const browser = await signedUpUser({ email: "max@example.com" });

    const result = await changeEmail(harness.context(browser), "loufor.d@gmail.com");

    expect(result).toEqual({ ok: true, awaiting: "verification" });
    expect(harness.emails.to("loufor.d@gmail.com")).toEqual([]);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "max@example.com", emailVerified: false });
  });

  it("is refused at the cap of 3 changes, as an address already in use is", async () => {
    await signedUpUser({ email: "abe.knox@gmail.com" });
    const browser = await signedUpUser({ email: "bea@example.com", verified: true });
    for (const attempt of [1, 2, 3]) await changeEmail(harness.context(browser), `bea${attempt}@example.com`);

    expect(await changeEmail(harness.context(browser), "abe.knox@gmail.com")).toEqual({ ok: false, refusal: "change-limit" });
    expect(await changeEmail(harness.context(browser), "abeknox+bea@gmail.com")).toEqual({ ok: false, refusal: "change-limit" });
  });

  it("goes ahead to a different Gmail inbox", async () => {
    await signedUpUser({ email: "ned.gray@gmail.com" });
    const browser = await signedUpUser({ email: "oli@example.com", verified: true });

    expect(await changeEmail(harness.context(browser), "ned.grey@gmail.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(harness.emails.to("oli@example.com")).toHaveLength(2);
  });

  it("goes ahead to another address reaching the user's own Gmail inbox, through both links", async () => {
    const browser = await signedUpUser({ email: "pat.lowe@gmail.com", verified: true });

    expect(await changeEmail(harness.context(browser), "patlowe+outfits@gmail.com")).toEqual({ ok: true, awaiting: "approval" });
    await harness.openEmailedLink("pat.lowe@gmail.com", new TestBrowser());
    await harness.openEmailedLink("patlowe+outfits@gmail.com", new TestBrowser());

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "patlowe+outfits@gmail.com", emailVerified: true });
  });
});

describe("an email change's links, once another account has the new address's Gmail inbox", () => {
  it("stop the old address's approval link, as for an address someone has taken since", async () => {
    const browser = await signedUpUser({ email: "cal@example.com", verified: true });
    await changeEmail(harness.context(browser), "cal.ward@gmail.com");
    await signedUpUser({ email: "CalWard+mine@googlemail.com" });

    const response = await harness.openEmailedLink("cal@example.com", new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=approval&error=INVALID_TOKEN");
    expect(harness.emails.to("cal.ward@gmail.com")).toEqual([]);
  });

  it("stop the new address's link, changing nothing", async () => {
    const browser = await signedUpUser({ email: "dee@example.com", verified: true });
    await changeEmail(harness.context(browser), "dee.ross@gmail.com");
    await harness.openEmailedLink("dee@example.com", new TestBrowser());
    await signedUpUser({ email: "deeross@gmail.com" });

    const response = await harness.openEmailedLink("dee.ross@gmail.com", new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=verification&error=INVALID_TOKEN");
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "dee@example.com" });
  });
});

describe("changing an account's email at Better Auth's change-email endpoint, called directly, to an address reaching another account's Gmail inbox", () => {
  it("gets the answer the other account's own address gets, sending and changing nothing", async () => {
    await signedUpUser({ email: "rae.moss@gmail.com" });
    const browser = await signedUpUser({ email: "sam@example.com", verified: true });
    const exact = await harness.postToAuth("/change-email", { newEmail: "rae.moss@gmail.com" }, browser);
    const inUse = { status: exact.status, body: await exact.json() };

    for (const newEmail of ["raemoss@gmail.com", "rae.moss+script@googlemail.com"]) {
      const response = await harness.postToAuth("/change-email", { newEmail }, browser);

      expect({ status: response.status, body: await response.json() }, newEmail).toEqual(inUse);
      expect(harness.emails.to(newEmail)).toEqual([]);
    }
    expect(inUse).toEqual({ status: 200, body: { status: true } });
    expect(harness.emails.to("sam@example.com")).toHaveLength(1);
    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
  });

  it("lets a change to a different Gmail inbox through", async () => {
    await signedUpUser({ email: "tia.webb@gmail.com" });
    const browser = await signedUpUser({ email: "uma@example.com", verified: true });

    const response = await harness.postToAuth("/change-email", { newEmail: "tia.webb2@gmail.com" }, browser);

    expect(response.status).toBe(200);
    expect(await readPendingEmailChange(harness.context(browser))).toEqual({ newEmail: "tia.webb2@gmail.com", step: "approval" });
  });
});

describe("signing up with dots or a +tag at a provider other than Gmail", () => {
  it("goes through beside an account at the address without them", async () => {
    await signedUpUser({ email: "fay.wells@example.com" });
    await signedUpUser({ email: "gus@outlook.com" });

    for (const email of ["faywells@example.com", "fay.wells+shop@example.com", "g.us@outlook.com", "gus+x@outlook.com"]) {
      expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email })), email).toEqual({ ok: true });
    }
  });
});

describe("changing an account's email to an address with dots or a +tag at a provider other than Gmail", () => {
  it("goes ahead beside an account at the address without them", async () => {
    await signedUpUser({ email: "vic.hall@example.com" });
    const browser = await signedUpUser({ email: "wes@example.com", verified: true });

    expect(await changeEmail(harness.context(browser), "vichall@example.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(await readPendingEmailChange(harness.context(browser))).toEqual({ newEmail: "vichall@example.com", step: "approval" });
    expect(await changeEmail(harness.context(browser), "vic.hall+wes@example.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(await readPendingEmailChange(harness.context(browser))).toEqual({ newEmail: "vic.hall+wes@example.com", step: "approval" });
  });
});

describe("the Demo Account's address, the team Gmail's +demo plus-address", () => {
  // Each test starts afresh, with the team's address at Gmail, so the Demo Account's reaches the team's inbox.
  const TEAM_EMAIL = "team.outfits@gmail.com";

  it("doesn't stop the team's own address signing up once the Demo Account exists", async () => {
    const team = await createTestHarness({ teamEmail: TEAM_EMAIL });
    expect(await createDemoAccount(team.context(new TestBrowser()), { password: PASSWORD })).toEqual({ ok: true });

    expect(await signUp(team.context(new TestBrowser()), signUpInput({ email: TEAM_EMAIL }))).toEqual({ ok: true });
  });

  it("doesn't stop another address reaching the team's inbox, by sign-up or email change, once the Demo Account exists", async () => {
    const team = await createTestHarness({ teamEmail: TEAM_EMAIL });
    expect(await createDemoAccount(team.context(new TestBrowser()), { password: PASSWORD })).toEqual({ ok: true });
    const browser = await signedUpUser({ email: "yan@example.com", verified: true }, team);

    expect(await changeEmail(team.context(browser), "TeamOutfits+judges@googlemail.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(await readPendingEmailChange(team.context(browser))).toEqual({ newEmail: "teamoutfits+judges@googlemail.com", step: "approval" });
    expect(await signUp(team.context(new TestBrowser()), signUpInput({ email: "t.e.a.m.outfits+shop@gmail.com" }))).toEqual({ ok: true });
  });

  it("isn't stopped by an account at the team's own address, or at another address reaching its inbox: the team's script still creates the Demo Account", async () => {
    for (const email of [TEAM_EMAIL, "TeamOutfits+shop@googlemail.com"]) {
      const team = await createTestHarness({ teamEmail: TEAM_EMAIL });
      await signedUpUser({ email }, team);

      expect(await createDemoAccount(team.context(new TestBrowser()), { password: PASSWORD }), email).toEqual({ ok: true });
      expect(await signIn(team.context(new TestBrowser()), { identifier: "demo", password: PASSWORD }), email).toEqual({ ok: true });
    }
  });
});

let userCount = 0;

const PASSWORD = "a long enough password";

/**
 * A new user, signed up by our form and signed in on the browser returned, who has verified the
 * address by its link if told to.
 */
async function signedUpUser({ email, verified = false }: { email: string; verified?: boolean }, on = harness): Promise<TestBrowser> {
  const browser = new TestBrowser();
  expect(await signUp(on.context(browser), signUpInput({ email }))).toEqual({ ok: true });
  if (verified) await on.openEmailedLink(email, browser);
  return browser;
}

/** What a script calling Better Auth's sign-up endpoint itself would send. */
function signUpBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  userCount += 1;
  const username = `inbox_direct_${userCount}`;
  return {
    name: username,
    username,
    displayUsername: username,
    email: `${username}@example.com`,
    password: PASSWORD,
    stylePreference: "menswear",
    countryCode: "US",
    birthDate: "1990-05-17",
    ...overrides,
  };
}

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "9", month: "4", year: "1994" },
    username: `inbox_user_${userCount}`,
    email: `inbox.user${userCount}@example.com`,
    password: PASSWORD,
    stylePreference: "no_preference",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
}
