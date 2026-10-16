import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { LINES, STYLE_PREFERENCES } from "../../config/accounts";
import { AGE_GROUPS, BUDGET_TIERS, CONSULTATION_STATES, PHOTO_TYPES, type PhotoStyleWords } from "../../config/consultations";
import {
  STYLE_ICON_STATUSES,
  STYLING_FAILURE_REASONS,
  STYLING_KINDS,
  STYLING_STAGES,
  STYLING_STATUSES,
} from "../../config/stylings";

// Better Auth's own tables (user, session, account, verification), plus the Outfit Recommender
// fields on the user. Better Auth looks these up by the export names below.

export const stylePreferenceEnum = pgEnum("style_preference", STYLE_PREFERENCES);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // The username plugin stores the username lowercased for uniqueness, and the username as typed.
  username: text("username").unique(),
  displayUsername: text("display_username"),
  stylePreference: stylePreferenceEnum("style_preference").notNull(),
  countryCode: text("country_code").notNull(),
  // Only the birth year and month are kept: the day is dropped at sign-up.
  birthYear: integer("birth_year").notNull(),
  birthMonth: integer("birth_month").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Consultations.

export const photoTypeEnum = pgEnum("photo_type", PHOTO_TYPES);
export const budgetTierEnum = pgEnum("budget_tier", BUDGET_TIERS);
export const ageGroupEnum = pgEnum("age_group", AGE_GROUPS);
export const consultationStateEnum = pgEnum("consultation_state", CONSULTATION_STATES);

export const consultation = pgTable(
  "consultation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    photoType: photoTypeEnum("photo_type").notNull(),
    photoPathname: text("photo_pathname").notNull(),
    // What the photo check saw. Nothing else from the check is kept (ADR-0005).
    faceVisible: boolean("face_visible").notNull(),
    hairVisible: boolean("hair_visible").notNull(),
    upperBodyVisible: boolean("upper_body_visible").notNull(),
    legsVisible: boolean("legs_visible").notNull(),
    feetVisible: boolean("feet_visible").notNull(),
    hairCovered: boolean("hair_covered").notNull(),
    // The current Photo Style: one or two words from the configured list, strongest first. Not an
    // enum, so the list can change in config without a migration.
    photoStyle: text("photo_style").array().notNull().$type<PhotoStyleWords>(),
    // The current Budget Tier, or null for a Face Photo.
    budgetTier: budgetTierEnum("budget_tier"),
    // The user's profile when the Consultation started. Every Styling on it uses these, so a changed
    // profile affects only new Consultations.
    stylePreference: stylePreferenceEnum("style_preference").notNull(),
    countryCode: text("country_code").notNull(),
    ageGroup: ageGroupEnum("age_group").notNull(),
    state: consultationStateEnum("state").notNull(),
  },
  (table) => [
    index("consultation_user_id_created_at_idx").on(table.userId, table.createdAt),
    check("consultation_photo_style_words", sql`cardinality(${table.photoStyle}) between 1 and 2`),
    check("consultation_budget_tier_for_body_photos", sql`(${table.photoType} = 'face') = (${table.budgetTier} is null)`),
  ],
);

// Stylings: each pass that builds Outfits for a Consultation, the Style Icons it ranked, and the
// Outfits it made. Deleting a Consultation deletes them all.

export const stylingKindEnum = pgEnum("styling_kind", STYLING_KINDS);
export const stylingStatusEnum = pgEnum("styling_status", STYLING_STATUSES);
export const stylingStageEnum = pgEnum("styling_stage", STYLING_STAGES);
export const stylingFailureReasonEnum = pgEnum("styling_failure_reason", STYLING_FAILURE_REASONS);
// Not "line": Postgres has a built-in type of that name, which would win.
export const outfitLineEnum = pgEnum("outfit_line", LINES);
export const styleIconStatusEnum = pgEnum("style_icon_status", STYLE_ICON_STATUSES);

export const styling = pgTable(
  "styling",
  {
    id: text("id").primaryKey(),
    consultationId: text("consultation_id")
      .notNull()
      .references(() => consultation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: stylingKindEnum("kind").notNull(),
    // What it builds for. They become the Consultation's own once it succeeds.
    budgetTier: budgetTierEnum("budget_tier"),
    photoStyle: text("photo_style").array().notNull().$type<PhotoStyleWords>(),
    status: stylingStatusEnum("status").notNull(),
    // Where it is, or where it stopped. Every step saves as it finishes, so this is all a later
    // Styling needs to carry on: nothing relies on Workflow's own run data.
    stage: stylingStageEnum("stage").notNull(),
    stageMovedAt: timestamp("stage_moved_at", { withTimezone: true }).notNull(),
    outfitsWanted: integer("outfits_wanted").notNull(),
    outfitsMade: integer("outfits_made").notNull(),
    failureReason: stylingFailureReasonEnum("failure_reason"),
    workflowRunId: text("workflow_run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("styling_consultation_id_idx").on(table.consultationId),
    check("styling_photo_style_words", sql`cardinality(${table.photoStyle}) between 1 and 2`),
    check("styling_finished_unless_running", sql`(${table.status} = 'running') = (${table.finishedAt} is null)`),
    check("styling_failure_reason_when_failed", sql`(${table.status} = 'failed') = (${table.failureReason} is not null)`),
  ],
);

/** One row per Style Icon a Styling ranked for its Consultation, best first. */
export const styleIcon = pgTable(
  "style_icon",
  {
    id: text("id").primaryKey(),
    consultationId: text("consultation_id")
      .notNull()
      .references(() => consultation.id, { onDelete: "cascade" }),
    stylingId: text("styling_id")
      .notNull()
      .references(() => styling.id, { onDelete: "cascade" }),
    // From 1, in the order Outfits use them.
    position: integer("position").notNull(),
    qlooEntityId: text("qloo_entity_id").notNull(),
    name: text("name").notNull(),
    // The line its Outfit is in: for a no-preference user, the list it came from.
    line: outfitLineEnum("line").notNull(),
    status: styleIconStatusEnum("status").notNull(),
  },
  (table) => [
    unique("style_icon_styling_id_position_unique").on(table.stylingId, table.position),
    unique("style_icon_styling_id_qloo_entity_id_unique").on(table.stylingId, table.qlooEntityId),
  ],
);

export const outfit = pgTable(
  "outfit",
  {
    id: text("id").primaryKey(),
    consultationId: text("consultation_id")
      .notNull()
      .references(() => consultation.id, { onDelete: "cascade" }),
    stylingId: text("styling_id")
      .notNull()
      .references(() => styling.id, { onDelete: "cascade" }),
    // From 1: it's shown as "Outfit N".
    position: integer("position").notNull(),
    styleIconId: text("style_icon_id")
      .notNull()
      .references(() => styleIcon.id, { onDelete: "cascade" }),
    // Outfits switch in together when their Styling finishes, and only current ones are shown.
    current: boolean("current").notNull(),
  },
  (table) => [
    index("outfit_consultation_id_idx").on(table.consultationId),
    unique("outfit_styling_id_position_unique").on(table.stylingId, table.position),
  ],
);

// The Qloo cache: every Qloo response, trimmed to the fields the app uses, for QLOO_CACHE_LIFETIME_DAYS.

export const qlooCache = pgTable("qloo_cache", {
  // The canonical request, with its parameters sorted and their values normalised.
  requestKey: text("request_key").primaryKey(),
  body: jsonb("body").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
