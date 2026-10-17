import { findCountry } from "@/config/countries";

/** The header Vercel sets to the ISO 3166-1 alpha-2 code of the country of the request's IP address. */
const IP_COUNTRY_HEADER = "x-vercel-ip-country";

/**
 * The region gate: whether the request's IP country is on the Country list, the countries Gemini
 * serves. It isn't the user's own Country setting. A request without the header, as in local
 * development, is allowed. Sign-up and every Styling check it; signing in, reading and deleting
 * never do.
 */
export function isFromSupportedRegion(requestHeaders: Headers): boolean {
  const code = requestHeaders.get(IP_COUNTRY_HEADER)?.trim();
  return !code || findCountry(code) !== undefined;
}
