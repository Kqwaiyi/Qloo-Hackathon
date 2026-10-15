import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import * as z from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  STYLE_PREFERENCES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/config/accounts";
import { COPY } from "@/config/copy";
import { findCountry } from "@/config/countries";
import { AGE_GATE_COOKIE, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import { judgeAge, parseIsoBirthDate } from "@/server/accounts/birth-date";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import * as schema from "@/server/db/schema";
import { serializeCookie } from "@/server/http/cookies";

export interface AuthOptions {
  db: Database;
  clock: Clock;
  baseURL: string;
  /** Other origins the app is served from, such as a preview deployment's own URL. */
  trustedOrigins?: string[];
  secret: string;
}

export function createAuth({ db, clock, baseURL, trustedOrigins, secret }: AuthOptions) {
  return betterAuth({
    appName: "Outfit Recommender",
    baseURL,
    trustedOrigins,
    secret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    user: {
      additionalFields: {
        stylePreference: {
          type: [...STYLE_PREFERENCES],
          required: true,
          validator: { input: z.enum(STYLE_PREFERENCES) },
        },
        countryCode: {
          type: "string",
          required: true,
          validator: { input: z.string().refine((code) => findCountry(code)?.code === code, "Not a supported Country") },
        },
        birthYear: { type: "number", required: false, input: false },
        birthMonth: { type: "number", required: false, input: false },
      },
    },
    hooks: {
      // Rechecks 18+ on every email sign-up, ours or a direct call, before anything is read or written.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        // A browser already blocked is refused without restarting its 30 days.
        if (ctx.headers && isBlockedByAgeGate(ctx.headers)) throw under18();
        const birthDate = parseIsoBirthDate(ctx.body?.birthDate);
        if (!birthDate) throw birthDateRequired();
        const verdict = judgeAge(birthDate, clock.now());
        if (verdict === "turns-18-today") throw under18();
        if (verdict === "under-18") {
          throw under18({ "set-cookie": serializeCookie({ ...AGE_GATE_COOKIE, secure: baseURL.startsWith("https://") }) });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Keeps the birth year and month from the date of birth sent with the sign-up, and drops the day.
          before: async (_newUser, ctx) => {
            const birthDate = parseIsoBirthDate(ctx?.body?.birthDate);
            if (!birthDate) throw birthDateRequired();
            return { data: { birthYear: birthDate.year, birthMonth: birthDate.month } };
          },
        },
      },
    },
    plugins: [username({ minUsernameLength: USERNAME_MIN_LENGTH, maxUsernameLength: USERNAME_MAX_LENGTH })],
  });
}

export type Auth = ReturnType<typeof createAuth>;

function under18(headers: Record<string, string> = {}): APIError {
  return new APIError("BAD_REQUEST", { code: "UNDER_18", message: COPY.under18 }, headers);
}

function birthDateRequired(): APIError {
  return new APIError("BAD_REQUEST", { code: "BIRTH_DATE_REQUIRED", message: "A valid date of birth is required." });
}
