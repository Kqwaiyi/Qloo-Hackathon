import { afterEach, describe, expect, it, vi } from "vitest";

import { botCheckFromEnvironment } from "./bot-check";

const APP_HOSTNAMES = ["outfits.example"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Bot Check as the environment sets it up", () => {
  it("is on with the secret set, giving the forms the site key", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    vi.stubEnv("VERCEL_ENV", "preview");

    const setup = botCheckFromEnvironment(APP_HOSTNAMES);

    expect(setup).toMatchObject({ siteKey: "site-key", options: { secret: "secret-key", allowedHostnames: undefined } });
  });

  it("checks the token's hostname on Production only", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(botCheckFromEnvironment(APP_HOSTNAMES)?.options.allowedHostnames).toEqual(APP_HOSTNAMES);
  });

  it("is off with no secret, as in local development and on a Preview without keys", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(botCheckFromEnvironment(APP_HOSTNAMES)).toBeNull();
  });

  it("is an error on Production with no secret, rather than a silently unprotected app", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(() => botCheckFromEnvironment(APP_HOSTNAMES)).toThrow("TURNSTILE_SECRET_KEY");
  });

  it("is an error with a secret but no site key, since the forms couldn't make a token", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");

    expect(() => botCheckFromEnvironment(APP_HOSTNAMES)).toThrow("TURNSTILE_SITE_KEY");
  });
});
