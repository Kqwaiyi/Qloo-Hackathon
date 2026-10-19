import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { changeEmail, readPendingEmailChange } from "@/server/operations/email-change";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

const HOUR_MS = 60 * 60 * 1000;

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

describe("a verified user changing their email", () => {
  it("asks the old address to approve first, saying where it's going and who to tell if it wasn't them, and changes nothing yet", async () => {
    const browser = await verifiedUser("ava@example.com");

    const result = await changeEmail(harness.context(browser), "ava.new@example.com");

    expect(result).toEqual({ ok: true, awaiting: "approval" });
    const [approval] = harness.emails.to("ava@example.com").slice(1);
    expect(approval!.subject).toBe("Approve your new email for Qurator");
    expect(approval!.text).toContain("Someone asked to change the email for your Qurator account to ava.new@example.com.");
    expect(approval!.text).toContain("http://localhost:3000/api/auth/verify-email?token=");
    expect(approval!.text).toContain("The link works for 24 hours.");
    expect(approval!.text).toContain("email us at team@example.test");
    expect(harness.emails.to("ava.new@example.com")).toEqual([]);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "ava@example.com", emailVerified: true });
  });

  it("sends the new address its link once the old address approves, on any device, still changing nothing", async () => {
    const browser = await verifiedUser("ben@example.com");
    await changeEmail(harness.context(browser), "ben.new@example.com");

    const approved = await harness.openEmailedLink("ben@example.com", new TestBrowser());

    expect(approved.status).toBe(302);
    expect(approved.headers.get("location")).toBe("/email-change?step=approval");
    const [verification] = harness.emails.to("ben.new@example.com");
    expect(verification!.subject).toBe("Confirm your new email for Qurator");
    expect(verification!.text).toContain("To finish changing your Qurator email to this address, open this link:");
    expect(verification!.text).toContain("http://localhost:3000/api/auth/verify-email?token=");
    expect(verification!.text).toContain("The link works for 24 hours.");
    expect(verification!.text).toContain("Didn't ask for this? Ignore this email and nothing changes.");
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "ben@example.com", emailVerified: true });
  });

  it("changes the email, verified, once the new address's link is opened, signing in the device that opened it", async () => {
    const browser = await verifiedUser("cleo@example.com");
    await changeEmail(harness.context(browser), "cleo.new@example.com");
    await harness.openEmailedLink("cleo@example.com", new TestBrowser());
    const phone = new TestBrowser();

    const changed = await harness.openEmailedLink("cleo.new@example.com", phone);

    expect(changed.status).toBe(302);
    expect(changed.headers.get("location")).toBe("/email-change?step=verification");
    expect(await readSignedInUser(harness.context(phone))).toMatchObject({ email: "cleo.new@example.com", emailVerified: true });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "cleo.new@example.com", emailVerified: true });
    const password = "a long enough password";
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "cleo.new@example.com", password })).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "cleo@example.com", password })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("answers an address already in use just as it answers any other, sending and changing nothing", async () => {
    await verifiedUser("dev@example.com");
    const browser = await verifiedUser("eve@example.com");

    const result = await changeEmail(harness.context(browser), "DEV@example.com");

    expect(result).toEqual({ ok: true, awaiting: "approval" });
    expect(harness.emails.to("eve@example.com")).toHaveLength(1);
    expect(harness.emails.to("dev@example.com")).toHaveLength(1);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "eve@example.com", emailVerified: true });
  });
});

describe("Better Auth's change-email endpoint, called directly", () => {
  it("asks a verified user's old address to approve the change too, changing nothing yet", async () => {
    const browser = await verifiedUser("yan@example.com");

    const response = await harness.postToAuth("/change-email", { newEmail: "yan.new@example.com", callbackURL: "/elsewhere" }, browser);

    expect(response.status).toBe(200);
    expect(harness.emails.to("yan@example.com").at(-1)!.text).toContain("callbackURL=%2Femail-change%3Fstep%3Dapproval");
    expect(harness.emails.to("yan.new@example.com")).toEqual([]);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "yan@example.com" });
  });

  it("counts server API calls towards the cap of 3 changes", async () => {
    const browser = await verifiedUser("zed@example.com");
    for (const attempt of [1, 2, 3]) {
      await harness.auth.api.changeEmail({ body: { newEmail: `zed${attempt}@example.com` }, headers: browser.requestHeaders() });
    }

    expect(await changeEmail(harness.context(browser), "zed4@example.com")).toEqual({ ok: false, refusal: "change-limit" });
    expect(harness.emails.to("zed@example.com")).toHaveLength(4);
  });
});

describe("refusals", () => {
  it("refuses a signed-out visitor, a malformed address or the address the user already has, sending nothing", async () => {
    const browser = await verifiedUser("abe@example.com");

    expect(await changeEmail(harness.context(new TestBrowser()), "abe.new@example.com")).toEqual({ ok: false, refusal: "signed-out" });
    expect(await changeEmail(harness.context(browser), "not an address")).toEqual({ ok: false, refusal: "invalid-email" });
    expect(await changeEmail(harness.context(browser), " ABE@example.com ")).toEqual({ ok: false, refusal: "same-email" });
    expect(harness.emails.to("abe@example.com")).toHaveLength(1);
  });
});

describe("the links' 24 hours", () => {
  // Better Auth times its links with the real clock, so these tests move Date itself.
  it("still let the change through just before 24 hours are up", async () => {
    const browser = await verifiedUser("vic@example.com");
    vi.useFakeTimers({ toFake: ["Date"] });
    await changeEmail(harness.context(browser), "vic.new@example.com");
    vi.setSystemTime(Date.now() + 24 * HOUR_MS - 60_000);
    await harness.openEmailedLink("vic@example.com", new TestBrowser());
    vi.setSystemTime(Date.now() + 24 * HOUR_MS - 60_000);

    await harness.openEmailedLink("vic.new@example.com", new TestBrowser());

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "vic.new@example.com" });
  });

  it("have expired after 24 hours, landing on the email-change page with an error", async () => {
    const browser = await verifiedUser("wes@example.com");
    vi.useFakeTimers({ toFake: ["Date"] });
    await changeEmail(harness.context(browser), "wes.new@example.com");
    vi.setSystemTime(Date.now() + 24 * HOUR_MS + 60_000);

    const response = await harness.openEmailedLink("wes@example.com", new TestBrowser());

    expect(response.headers.get("location")).toMatch(/^\/email-change\?step=approval&error=\w+$/);
    expect(harness.emails.to("wes.new@example.com")).toEqual([]);
  });

  it("send a broken link to the email-change page with an error", async () => {
    const browser = await verifiedUser("xia@example.com");
    await changeEmail(harness.context(browser), "xia.new@example.com");

    const response = await harness.openAuthLink(harness.linkEmailedTo("xia@example.com").replace("token=", "token=broken"), new TestBrowser());

    expect(response.headers.get("location")).toMatch(/^\/email-change\?step=approval&error=\w+$/);
    expect(harness.emails.to("xia.new@example.com")).toEqual([]);
  });
});

describe("links that no longer fit the change", () => {
  it("stop the earlier change's approval link once a newer change replaces it", async () => {
    const browser = await verifiedUser("oli@example.com");
    await changeEmail(harness.context(browser), "oli.a@example.com");
    const earlierApproval = harness.linkEmailedTo("oli@example.com");
    await changeEmail(harness.context(browser), "oli.b@example.com");

    const response = await harness.openAuthLink(earlierApproval, new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=approval&error=INVALID_TOKEN");
    expect(harness.emails.to("oli.a@example.com")).toEqual([]);
    expect(await readPendingEmailChange(harness.context(browser))).toEqual({ newEmail: "oli.b@example.com", step: "approval" });
  });

  it("stop the earlier new address's link once a newer change replaces it", async () => {
    const browser = await verifiedUser("pat@example.com");
    await changeEmail(harness.context(browser), "pat.a@example.com");
    await harness.openEmailedLink("pat@example.com", new TestBrowser());
    await changeEmail(harness.context(browser), "pat.b@example.com");

    const response = await harness.openEmailedLink("pat.a@example.com", new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=verification&error=INVALID_TOKEN");
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "pat@example.com" });
  });

  it("stop the approval link once someone else has taken the new address", async () => {
    const browser = await verifiedUser("rae@example.com");
    await changeEmail(harness.context(browser), "rae.new@example.com");
    await signUp(harness.context(new TestBrowser()), signUpInput("rae.new@example.com"));

    const response = await harness.openEmailedLink("rae@example.com", new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=approval&error=INVALID_TOKEN");
    expect(harness.emails.to("rae.new@example.com")).toHaveLength(1);
  });

  it("stop the new address's link once someone else has taken it, changing nothing", async () => {
    const browser = await verifiedUser("sam@example.com");
    await changeEmail(harness.context(browser), "sam.new@example.com");
    await harness.openEmailedLink("sam@example.com", new TestBrowser());
    const link = harness.linkEmailedTo("sam.new@example.com");
    await signUp(harness.context(new TestBrowser()), signUpInput("sam.new@example.com"));

    const response = await harness.openAuthLink(link, new TestBrowser());

    expect(response.headers.get("location")).toBe("/email-change?step=verification&error=INVALID_TOKEN");
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "sam@example.com" });
  });
});

describe("the cap of 3 email changes per account in 24 hours", () => {
  it("counts each verified change once, though it sends two emails, and refuses a fourth without sending", async () => {
    const browser = await verifiedUser("jo@example.com");
    let current = "jo@example.com";
    for (const attempt of [1, 2, 3]) {
      const next = `jo${attempt}@example.com`;
      expect(await changeEmail(harness.context(browser), next)).toEqual({ ok: true, awaiting: "approval" });
      await harness.openEmailedLink(current, new TestBrowser());
      await harness.openEmailedLink(next, new TestBrowser());
      current = next;
    }

    const fourth = await changeEmail(harness.context(browser), "jo4@example.com");

    expect(fourth).toEqual({ ok: false, refusal: "change-limit" });
    expect(harness.emails.to("jo3@example.com")).toHaveLength(1);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "jo3@example.com" });
  });

  it("refuses an address already in use at the cap, as it refuses any other", async () => {
    await verifiedUser("kim@example.com");
    const browser = await verifiedUser("lou@example.com");
    for (const attempt of [1, 2, 3]) await changeEmail(harness.context(browser), `lou${attempt}@example.com`);

    expect(await changeEmail(harness.context(browser), "kim@example.com")).toEqual({ ok: false, refusal: "change-limit" });
    expect(await changeEmail(harness.context(browser), "lou4@example.com")).toEqual({ ok: false, refusal: "change-limit" });
  });

  it("counts the changes made before verifying with those made after", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput("max@example.com"));
    await changeEmail(harness.context(browser), "max1@example.com");
    await changeEmail(harness.context(browser), "max2@example.com");
    await harness.openEmailedLink("max2@example.com", browser);

    expect(await changeEmail(harness.context(browser), "max3@example.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(await changeEmail(harness.context(browser), "max4@example.com")).toEqual({ ok: false, refusal: "change-limit" });
  });

  it("lets an approval link opened again send the new address another link, 3 times in 24 hours", async () => {
    const browser = await verifiedUser("tia@example.com");
    await changeEmail(harness.context(browser), "tia.new@example.com");
    const approval = harness.linkEmailedTo("tia@example.com");
    for (const attempt of [1, 2, 3]) {
      expect((await harness.openAuthLink(approval, new TestBrowser())).headers.get("location"), `opening ${attempt}`).toBe(
        "/email-change?step=approval",
      );
    }

    const fourth = await harness.openAuthLink(approval, new TestBrowser());

    expect(fourth.headers.get("location")).toBe("/email-change?step=approval&error=EMAIL_LIMIT_REACHED");
    expect(harness.emails.to("tia.new@example.com")).toHaveLength(3);
    await harness.openEmailedLink("tia.new@example.com", new TestBrowser());
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "tia.new@example.com" });
  });

  it("allows changes again once the earlier ones are 24 hours old", async () => {
    const browser = await verifiedUser("ned@example.com");
    for (const attempt of [1, 2, 3]) await changeEmail(harness.context(browser), `ned${attempt}@example.com`);

    harness.clock.set("2026-10-17T12:00:01Z");

    expect(await changeEmail(harness.context(browser), "ned4@example.com")).toEqual({ ok: true, awaiting: "approval" });
  });
});

describe("while every email is paused, 450 sent in 24 hours", () => {
  it("refuses a change, and an approval link that would send the new address its link", async () => {
    harness.clock.set("2026-12-01T09:00:00Z");
    const browser = await verifiedUser("uma@example.com");
    await changeEmail(harness.context(browser), "uma.new@example.com");
    for (let index = 0; index < 450; index += 1) {
      await harness.emailSender.send({ kind: "password-changed", userId: null, to: `x${index}@example.com`, subject: "S", text: "T" });
    }

    const change = await changeEmail(harness.context(browser), "uma.other@example.com");
    const approving = await harness.openEmailedLink("uma@example.com", new TestBrowser());

    expect(change).toEqual({ ok: false, refusal: "emails-paused" });
    expect(approving.headers.get("location")).toBe("/email-change?step=approval&error=EMAILS_PAUSED");
    expect(harness.emails.to("uma.new@example.com")).toEqual([]);
  });
});

describe("the pending step Settings shows", () => {
  it("is the old address's approval, then the new address's link, then nothing once the email has changed", async () => {
    const browser = await verifiedUser("fay@example.com");
    const before = await readPendingEmailChange(harness.context(browser));

    await changeEmail(harness.context(browser), "fay.new@example.com");
    const requested = await readPendingEmailChange(harness.context(browser));
    await harness.openEmailedLink("fay@example.com", new TestBrowser());
    const approved = await readPendingEmailChange(harness.context(browser));
    await harness.openEmailedLink("fay.new@example.com", new TestBrowser());
    const changed = await readPendingEmailChange(harness.context(browser));

    expect(before).toBeNull();
    expect(requested).toEqual({ newEmail: "fay.new@example.com", step: "approval" });
    expect(approved).toEqual({ newEmail: "fay.new@example.com", step: "verification" });
    expect(changed).toBeNull();
  });

  it("lasts as long as the step's link, 24 hours from when it was sent", async () => {
    const browser = await verifiedUser("gus@example.com");
    await changeEmail(harness.context(browser), "gus.new@example.com");
    harness.clock.set("2026-10-17T06:00:00Z");
    await harness.openEmailedLink("gus@example.com", new TestBrowser());

    harness.clock.set("2026-10-18T05:59:00Z");
    const justBefore = await readPendingEmailChange(harness.context(browser));
    harness.clock.set("2026-10-18T06:00:00Z");
    const after = await readPendingEmailChange(harness.context(browser));

    expect(justBefore).toEqual({ newEmail: "gus.new@example.com", step: "verification" });
    expect(after).toBeNull();
  });

  it("shows nothing for an address already in use, since nothing was sent", async () => {
    await verifiedUser("hal@example.com");
    const browser = await verifiedUser("ian@example.com");

    await changeEmail(harness.context(browser), "hal@example.com");

    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
  });

  it("shows nothing to a signed-out visitor", async () => {
    expect(await readPendingEmailChange(harness.context(new TestBrowser()))).toBeNull();
  });
});

let userCount = 0;

/** A user who signed up with this email and verified it by the emailed link, signed in on the browser returned. */
async function verifiedUser(email: string): Promise<TestBrowser> {
  const browser = new TestBrowser();
  expect(await signUp(harness.context(browser), signUpInput(email))).toEqual({ ok: true });
  await harness.openEmailedLink(email, browser);
  return browser;
}

function signUpInput(email: string): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `changer_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
  };
}
