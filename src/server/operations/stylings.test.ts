import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PhotoType } from "@/config/consultations";
import { consultation, qlooCache, styleIcon, styling, user } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { readStylingStatus } from "@/server/operations/stylings";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities.
const WOMEN = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const MEN = [qlooPerson("m-1", "Dev Rowe", 0.93), qlooPerson("m-2", "Eli Frost", 0.9), qlooPerson("m-3", "Finn Ash", 0.85)];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = peopleByGender({ female: WOMEN, male: MEN });
  await harness.db.delete(qlooCache);
});

describe("a new Consultation's first Styling", () => {
  it("starts with the Consultation, which shows Styling… until it finishes", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");

    const consultationId = await start(browser, "full_body");

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "styling", outfits: [] });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "styling", stage: "style_icons" });
    expect(await stylingsOf(consultationId)).toEqual([
      {
        id: harness.stylings.pending[0],
        consultationId,
        userId: (await readSignedInUser(harness.context(browser)))!.id,
        kind: "first",
        budgetTier: "no_budget",
        photoStyle: ["casual"],
        status: "running",
        stage: "style_icons",
        stageMovedAt: new Date("2026-10-16T12:30:00Z"),
        outfitsWanted: 2,
        outfitsMade: 0,
        failureReason: null,
        workflowRunId: expect.any(String),
        startedAt: new Date("2026-10-16T12:30:00Z"),
        finishedAt: null,
      },
    ]);
    expect(harness.qloo.requests).toEqual([]);
  });

  it("builds two Outfits from the top two Style Icons, switching them in together when it finishes", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "full_body");
    harness.clock.set("2026-10-16T12:30:20Z");

    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [
        { id: expect.any(String), position: 1, styleIconName: "Ava Stone" },
        { id: expect.any(String), position: 2, styleIconName: "Bea Marsh" },
      ],
    });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "ready", stage: null });
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({
        status: "succeeded",
        stage: "building_outfits",
        stageMovedAt: new Date("2026-10-16T12:30:20Z"),
        outfitsWanted: 2,
        outfitsMade: 2,
        failureReason: null,
        finishedAt: new Date("2026-10-16T12:30:20Z"),
      }),
    ]);
  });

  it("asks Qloo once, for well-known people in the user's line, age group and Country, in tune with the Photo Style", async () => {
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "US", birthDate: { day: "2", month: "2", year: "1992" } });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(harness.qloo.requests).toHaveLength(1);
    const [request] = harness.qloo.requests;
    expect(request!.method).toBe("GET");
    expect(request!.url.pathname).toBe("/v2/insights");
    expect(Object.fromEntries(request!.url.searchParams)).toMatchObject({
      "filter.type": "urn:entity:person",
      "filter.gender": "male",
      "signal.demographics.gender": "male",
      "signal.demographics.age": "30_to_34",
      "signal.location.query": "United States",
      "signal.interests.tags": "urn:tag:personal_style:qloo:casual",
      "filter.popularity.min": "0.995",
      take: "50",
    });
  });

  it("searches with the Style Preference, Country and age group stored on the Consultation, not the profile since", async () => {
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "US", birthDate: { day: "20", month: "11", year: "1991" } });
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    harness.clock.set("2026-10-31T23:00:00Z");
    await start(browser, "full_body");

    // The user changes their profile, and turns 35, before the Styling's steps run.
    await harness.db.update(user).set({ stylePreference: "womenswear", countryCode: "GB" }).where(eq(user.id, userId));
    harness.clock.set("2026-11-01T01:00:00Z");
    await harness.stylings.runPending();

    expect(harness.qloo.requests.map((request) => Object.fromEntries(request.url.searchParams))).toEqual([
      expect.objectContaining({
        "filter.gender": "male",
        "signal.location.query": "United States",
        "signal.demographics.age": "30_to_34",
      }),
    ]);
  });

  it("gives a no-preference user a womenswear and a menswear call, and Outfits from each line in turn", async () => {
    const browser = await signedInUser({ stylePreference: "no_preference" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    expect(harness.qloo.requests.map((request) => request.url.searchParams.get("filter.gender")).toSorted()).toEqual([
      "female",
      "male",
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Dev Rowe",
    ]);
  });

  it("keeps each ranked Style Icon with the Styling that picked it, its position, line and whether it was used", async () => {
    const browser = await signedInUser({ stylePreference: "no_preference" });
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;

    await harness.stylings.runPending();

    const icons = await harness.db
      .select()
      .from(styleIcon)
      .where(eq(styleIcon.consultationId, consultationId))
      .orderBy(asc(styleIcon.position));
    expect(icons.map(({ stylingId, position, qlooEntityId, name, line, status }) => ({ stylingId, position, qlooEntityId, name, line, status }))).toEqual([
      { stylingId, position: 1, qlooEntityId: "w-1", name: "Ava Stone", line: "womenswear", status: "used" },
      { stylingId, position: 2, qlooEntityId: "m-1", name: "Dev Rowe", line: "menswear", status: "used" },
      { stylingId, position: 3, qlooEntityId: "w-2", name: "Bea Marsh", line: "womenswear", status: "unused" },
      { stylingId, position: 4, qlooEntityId: "m-2", name: "Eli Frost", line: "menswear", status: "unused" },
      { stylingId, position: 5, qlooEntityId: "w-3", name: "Cleo Hart", line: "womenswear", status: "unused" },
      { stylingId, position: 6, qlooEntityId: "m-3", name: "Finn Ash", line: "menswear", status: "unused" },
    ]);
  });

  it("never picks a Style Icon on the denylist", async () => {
    harness.qloo.respond = peopleByGender({ male: [qlooPerson("CB6258A6-C9B8-45C8-81CD-45D6077DD981", "Conor McGregor", 0.99), ...MEN] });
    const browser = await signedInUser({ stylePreference: "menswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Dev Rowe",
      "Eli Frost",
    ]);
  });
});

describe("what Qloo receives", () => {
  it("is nothing that identifies the user, their Consultation or their photo", async () => {
    const browser = await signedInUser({ username: "Ziggy.Quartz", email: "ziggy.quartz@example.com", stylePreference: "no_preference" });
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;

    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const identifiers = [
      (await readSignedInUser(harness.context(browser)))!.id,
      "Ziggy.Quartz",
      "ziggy.quartz",
      "ziggy.quartz@example.com",
      "example.com",
      consultationId,
      stylingId!,
      stored!.photoPathname,
    ];
    expect(harness.qloo.requests).toHaveLength(2);
    for (const request of harness.qloo.requests) {
      expect([...request.headers.keys()]).toEqual(["x-api-key"]);
      for (const sent of [decodeURIComponent(request.url.href), ...request.headers.values()]) {
        for (const identifier of identifiers) expect(sent.toLowerCase()).not.toContain(identifier.toLowerCase());
      }
    }
  });

  it("is the same for two users with the same profile, so nothing links two calls to one user", async () => {
    const profile = { stylePreference: "womenswear", countryCode: "FR", birthDate: { day: "1", month: "6", year: "1990" } } as const;
    await start(await signedInUser(profile), "full_body");
    await harness.stylings.runPending();
    await harness.db.delete(qlooCache);

    await start(await signedInUser(profile), "face");
    await harness.stylings.runPending();

    const [first, second] = harness.qloo.requests;
    expect(second!.url.href).toBe(first!.url.href);
  });
});

describe("a first Styling that can't build anything", () => {
  it("fails as nothing could be built when Qloo finds no Style Icon, and the Consultation shows No Outfits", async () => {
    harness.qloo.respond = () => qlooResponse([]);
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");
    harness.clock.set("2026-10-16T12:01:00Z");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({
        status: "failed",
        failureReason: "nothing_built",
        outfitsMade: 0,
        finishedAt: new Date("2026-10-16T12:01:00Z"),
      }),
    ]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "no_outfits", stage: null });
  });

  it("fails as something broke when Qloo keeps failing, keeping nothing", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "something_broke", stage: "style_icons", outfitsMade: 0 }),
    ]);
    expect(await harness.db.select().from(styleIcon).where(eq(styleIcon.consultationId, consultationId))).toEqual([]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
  });

  it("makes the one Outfit it can when Qloo finds a single Style Icon, and succeeds", async () => {
    harness.qloo.respond = peopleByGender({ male: [MEN[0]!, { ...MEN[1]!, properties: { date_of_death: "2020-01-01" } }] });
    const browser = await signedInUser({ stylePreference: "menswear" });
    const consultationId = await start(browser, "full_body");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsWanted: 2, outfitsMade: 1 })]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Dev Rowe",
    ]);
  });
});

describe("a Styling that stops running while its steps are under way", () => {
  it("saves nothing late, and calls Qloo no more", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;
    // As a cancelled or timed-out Styling is left.
    const ended = { status: "failed", failureReason: "something_broke", finishedAt: new Date("2026-10-16T12:05:00Z") } as const;
    await harness.db.update(styling).set(ended).where(eq(styling.id, stylingId!));

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining(ended)]);
    expect(await harness.db.select().from(styleIcon).where(eq(styleIcon.consultationId, consultationId))).toEqual([]);
    expect(harness.qloo.requests).toEqual([]);
  });
});

describe("the Styling status", () => {
  it("is only for the Consultation's owner", async () => {
    const consultationId = await start(await signedInUser(), "full_body");

    expect(await readStylingStatus(harness.context(await signedInUser()), consultationId)).toBeNull();
    expect(await readStylingStatus(harness.context(new TestBrowser()), consultationId)).toBeNull();
  });
});

it("starts no Styling for a rejected photo", async () => {
  const browser = await signedInUser();
  harness.ai.scenario = "no-person";

  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "full_body" });

  expect(result).toMatchObject({ ok: false, refusal: "photo-rejected" });
  expect(harness.stylings.pending).toEqual([]);
  expect(await harness.db.select().from(styling)).not.toContainEqual(
    expect.objectContaining({ userId: (await readSignedInUser(harness.context(browser)))!.id }),
  );
});

/** A Qloo person entity, as Qloo sends it. */
function qlooPerson(entityId: string, name: string, affinity: number) {
  return { entity_id: entityId, name, type: "urn:entity", subtype: "urn:entity:person", properties: {}, query: { affinity } };
}

/** Answers each person call with the people for its `filter.gender`, or no one. */
function peopleByGender(people: { female?: readonly object[]; male?: readonly object[] }) {
  return (request: RecordedQlooRequest) => {
    const gender = request.url.searchParams.get("filter.gender");
    return qlooResponse((gender === "female" || gender === "male" ? people[gender] : undefined) ?? []);
  };
}

/** Presses "Get my Outfits" with a plain JPEG, returning the new Consultation's id. */
async function start(browser: TestBrowser, photoType: PhotoType): Promise<string> {
  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

async function stylingsOf(consultationId: string) {
  return harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));
}

let userCount = 0;

/** Signs up a new adult user and returns their signed-in browser. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `styling_user_${userCount}`,
    email: `styling.user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
