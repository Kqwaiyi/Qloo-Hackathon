import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { EMAIL_CHANGE_STEPS, LINES, STYLE_PREFERENCES } from "../../config/accounts";
import {
  AGE_GROUPS,
  BUDGET_TIERS,
  CONSULTATION_STATES,
  PHOTO_TYPES,
  PIECE_CATEGORIES,
  type PhotoStyleWords,
} from "../../config/consultations";
import type { EmailKind } from "../../config/email";
import { USAGE_KINDS } from "../../config/limits";
import {
  PREVIEW_REFUSAL_REASONS,
  PREVIEW_STATES,
  STYLE_ICON_STATUSES,
  STYLING_FAILURE_REASONS,
  STYLING_KINDS,
  STYLING_STAGES,
  STYLING_STATUSES,
} from "../../config/stylings";

// Better Auth's own tables (user, session, account, verification, rate limit), plus the Qurator
// fields on the user. Better Auth looks these up by the export names below.

export const stylePreferenceEnum = pgEnum("style_preference", STYLE_PREFERENCES);

export const user = pgTable(
  "user",
  {
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
    // The photo notice the user last agreed to on the consent sheet, and when. Withdrawing photo
    // consent clears both.
    acceptedPhotoNoticeVersion: integer("accepted_photo_notice_version"),
    photoNoticeAcceptedAt: timestamp("photo_notice_accepted_at", { withTimezone: true }),
    // When a session of theirs was last created or refreshed, which the daily sweep's inactivity
    // rules count from. Better Auth doesn't know these two fields: our session hooks keep them.
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    // When the daily sweep's inactivity warning actually went out. Any activity since clears it.
    inactivityWarningSentAt: timestamp("inactivity_warning_sent_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "user_photo_notice_accepted_together",
      sql`(${table.acceptedPhotoNoticeVersion} is null) = (${table.photoNoticeAcceptedAt} is null)`,
    ),
  ],
);

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

/** Better Auth's rate-limit counters, kept in the database so every server instance shares them. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  // Milliseconds since the epoch, as Better Auth keeps it.
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// A verified user's email change while it waits on a link. Better Auth's links carry the change
// themselves; this is the step Settings shows, and the change those links must match to work.

export const emailChangeStepEnum = pgEnum("email_change_step", EMAIL_CHANGE_STEPS);

export const emailChange = pgTable("email_change", {
  // One change at a time: a newer one replaces it.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Lowercased, as Better Auth keeps addresses.
  newEmail: text("new_email").notNull(),
  step: emailChangeStepEnum("step").notNull(),
  // When the step's link went out.
  linkSentAt: timestamp("link_sent_at", { withTimezone: true }).notNull(),
});

// The email log: one row per email sent, which the email caps count. It never holds the address.

export const emailLog = pgTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    // Not an enum, so a new kind of email needs no migration.
    kind: text("kind").notNull().$type<EmailKind>(),
    // The account it was for, if any. Deleting the account strips it from the log.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("email_log_sent_at_idx").on(table.sentAt),
    index("email_log_user_id_kind_sent_at_idx").on(table.userId, table.kind, table.sentAt),
  ],
);

// Usage records, which the limits count. They're kept apart from Consultations, so deleting a
// Consultation keeps them, and they hold no photo and no Outfit content.

export const usageKindEnum = pgEnum("usage_kind", USAGE_KINDS);

export const usageRecord = pgTable(
  "usage_record",
  {
    id: text("id").primaryKey(),
    kind: usageKindEnum("kind").notNull(),
    // Whose usage it was. Deleting the account strips it from the record.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("usage_record_user_id_kind_used_at_idx").on(table.userId, table.kind, table.usedAt),
    // For the app-wide caps, which count every user's.
    index("usage_record_kind_used_at_idx").on(table.kind, table.usedAt),
  ],
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
    // On the Demo Account, the photo notice the judge agreed to on the consent sheet for this
    // Consultation, and when. Everyone else's agreement is kept on the user, and these stay null.
    acceptedPhotoNoticeVersion: integer("accepted_photo_notice_version"),
    photoNoticeAcceptedAt: timestamp("photo_notice_accepted_at", { withTimezone: true }),
  },
  (table) => [
    index("consultation_user_id_created_at_idx").on(table.userId, table.createdAt),
    check("consultation_photo_style_words", sql`cardinality(${table.photoStyle}) between 1 and 2`),
    check("consultation_budget_tier_for_body_photos", sql`(${table.photoType} = 'face') = (${table.budgetTier} is null)`),
    check(
      "consultation_photo_notice_accepted_together",
      sql`(${table.acceptedPhotoNoticeVersion} is null) = (${table.photoNoticeAcceptedAt} is null)`,
    ),
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
export const previewStateEnum = pgEnum("preview_state", PREVIEW_STATES);
export const previewRefusalReasonEnum = pgEnum("preview_refusal_reason", PREVIEW_REFUSAL_REASONS);

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
    // Whether it's the Demo Account's, whose Outfits no limit counts, so it writes no usage records,
    // and which holds no user's Styling lock.
    onDemoAccount: boolean("on_demo_account").notNull().default(false),
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
    // Style Icons it skipped because their tailoring failed. Each is replaced by the next unused
    // Style Icon, up to MAX_TAILORING_SUBSTITUTES times.
    tailoringFailures: integer("tailoring_failures").notNull(),
    failureReason: stylingFailureReasonEnum("failure_reason"),
    workflowRunId: text("workflow_run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("styling_consultation_id_idx").on(table.consultationId),
    // The Styling locks, so of two requests at once only one can start a Styling: one running per
    // Consultation, and one per user. The Demo Account has no lock of its own, so its judges can
    // style their own Consultations side by side.
    uniqueIndex("styling_running_per_consultation_unique").on(table.consultationId).where(sql`${table.status} = 'running'`),
    uniqueIndex("styling_running_per_user_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'running' and not ${table.onDemoAccount}`),
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
    // The Preview of the user wearing it: pending until rendered, then ready, refused or failed.
    previewState: previewStateEnum("preview_state").notNull(),
    // The WebP in the private Blob store, once it's ready.
    previewPathname: text("preview_pathname"),
    // Why the image model refused it, when it did.
    previewRefusalReason: previewRefusalReasonEnum("preview_refusal_reason"),
    // Body photos only: the Qloo entity ID of the Brand picked for each Brand Category, fixed before
    // tailoring and kept apart from the Pieces, so a Brand stays reserved even if no Piece shows it:
    // a One-Piece leaves out the Bottom Brand.
    topBrandEntityId: text("top_brand_entity_id"),
    bottomBrandEntityId: text("bottom_brand_entity_id"),
    shoesBrandEntityId: text("shoes_brand_entity_id"),
  },
  (table) => [
    index("outfit_consultation_id_idx").on(table.consultationId),
    unique("outfit_styling_id_position_unique").on(table.stylingId, table.position),
    check(
      "outfit_brand_picks_together",
      sql`(${table.topBrandEntityId} is null) = (${table.bottomBrandEntityId} is null) and (${table.bottomBrandEntityId} is null) = (${table.shoesBrandEntityId} is null)`,
    ),
    check("outfit_preview_pathname_when_ready", sql`(${table.previewState} = 'ready') = (${table.previewPathname} is not null)`),
    check(
      "outfit_preview_refusal_reason_when_refused",
      sql`(${table.previewState} = 'refused') = (${table.previewRefusalReason} is not null)`,
    ),
  ],
);

export const categoryEnum = pgEnum("category", PIECE_CATEGORIES);

/** One per Category an Outfit fills, or a One-Piece filling its Top and Bottom, tailored by the AI. */
export const piece = pgTable(
  "piece",
  {
    id: text("id").primaryKey(),
    outfitId: text("outfit_id")
      .notNull()
      .references(() => outfit.id, { onDelete: "cascade" }),
    category: categoryEnum("category").notNull(),
    // A card label of about 6 words; for the Hairstyle, the cut.
    item: text("item").notNull(),
    // One sentence on colour, fabric, fit and cut, for the Preview. Never shown.
    details: text("details").notNull(),
    // One line on why it suits the user.
    why: text("why").notNull(),
    // The Hairstyle only: the AI didn't know the Style Icon's signature cut, so based it on the Outfit.
    unknownCut: boolean("unknown_cut"),
    // Every Piece but the Hairstyle: the Brand it's built on, as Qloo had it, which for a One-Piece is
    // the Top Brand. The official site and prices can be missing.
    brandEntityId: text("brand_entity_id"),
    brandName: text("brand_name"),
    brandOfficialSite: text("brand_official_site"),
    brandPriceUsdMin: doublePrecision("brand_price_usd_min"),
    brandPriceUsdMax: doublePrecision("brand_price_usd_max"),
  },
  (table) => [
    unique("piece_outfit_id_category_unique").on(table.outfitId, table.category),
    check("piece_unknown_cut_for_hairstyles", sql`(${table.category} = 'hairstyle') = (${table.unknownCut} is not null)`),
    check(
      "piece_brand_unless_hairstyle",
      sql`(${table.category} = 'hairstyle') = (${table.brandEntityId} is null) and (${table.brandEntityId} is null) = (${table.brandName} is null)`,
    ),
  ],
);

// The Qloo cache: every Qloo response, trimmed to the fields the app uses, for QLOO_CACHE_LIFETIME_DAYS.

export const qlooCache = pgTable("qloo_cache", {
  // The canonical request, with its parameters sorted and their values normalised.
  requestKey: text("request_key").primaryKey(),
  body: jsonb("body").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// The Brand matches: whether the product search knows each Qloo Brand, found or not, for
// BRAND_MATCH_LIFETIME_DAYS. A later lookup of the Brand replaces its match.

export const brandMatch = pgTable("brand_match", {
  qlooEntityId: text("qloo_entity_id").primaryKey(),
  // The product search's own ID for the Brand, or null when it doesn't know the Brand.
  productSearchBrandId: text("product_search_brand_id"),
  lookedUpAt: timestamp("looked_up_at", { withTimezone: true }).notNull(),
});

// The Qloo limit state: what Qloo last reported of this month's calls, which the Qloo backstop reads.

export const qlooLimitState = pgTable(
  "qloo_limit_state",
  {
    // There's only ever the one row.
    id: integer("id").primaryKey().default(1),
    remainingCalls: integer("remaining_calls").notNull(),
    // When they reset, if Qloo said.
    resetsAt: timestamp("resets_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [check("qloo_limit_state_one_row", sql`${table.id} = 1`)],
);
