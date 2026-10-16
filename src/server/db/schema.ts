import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { STYLE_PREFERENCES } from "../../config/accounts";
import { AGE_GROUPS, BUDGET_TIERS, PHOTO_TYPES, type PhotoStyleWords } from "../../config/consultations";

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
  },
  (table) => [
    index("consultation_user_id_created_at_idx").on(table.userId, table.createdAt),
    check("consultation_photo_style_words", sql`cardinality(${table.photoStyle}) between 1 and 2`),
    check("consultation_budget_tier_for_body_photos", sql`(${table.photoType} = 'face') = (${table.budgetTier} is null)`),
  ],
);

// The Qloo cache: every Qloo response, trimmed to the fields the app uses, for QLOO_CACHE_LIFETIME_DAYS.

export const qlooCache = pgTable("qloo_cache", {
  // The canonical request, with its parameters sorted and their values normalised.
  requestKey: text("request_key").primaryKey(),
  body: jsonb("body").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
