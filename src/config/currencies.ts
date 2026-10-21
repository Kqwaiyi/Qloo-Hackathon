// Each Country's currency (spec: "Prices and currencies"): the one every price a user sees is in.
// Generated once, on 2026-10-21, from the Unicode CLDR currency data (CLDR 48, cldr-json 48.2.3),
// which has Bulgaria on the euro since 2026-01-01: each Country's current legal tender. Where CLDR
// gives a Country none or several, the spec chose one, as marked.

const COUNTRY_CURRENCIES: Readonly<Record<string, string>> = {
  AD: "EUR", // Andorra
  AE: "AED", // United Arab Emirates
  AG: "XCD", // Antigua and Barbuda
  AI: "XCD", // Anguilla
  AL: "ALL", // Albania
  AM: "AMD", // Armenia
  AO: "AOA", // Angola
  AQ: "USD", // Antarctica: the spec's choice, as CLDR gives it none.
  AR: "ARS", // Argentina
  AS: "USD", // American Samoa
  AT: "EUR", // Austria
  AU: "AUD", // Australia
  AW: "AWG", // Aruba
  AX: "EUR", // Åland Islands
  AZ: "AZN", // Azerbaijan
  BA: "BAM", // Bosnia and Herzegovina
  BB: "BBD", // Barbados
  BD: "BDT", // Bangladesh
  BE: "EUR", // Belgium
  BF: "XOF", // Burkina Faso
  BG: "EUR", // Bulgaria
  BH: "BHD", // Bahrain
  BI: "BIF", // Burundi
  BJ: "XOF", // Benin
  BL: "EUR", // Saint Barthélemy
  BM: "BMD", // Bermuda
  BN: "BND", // Brunei
  BO: "BOB", // Bolivia
  BQ: "USD", // Caribbean Netherlands
  BR: "BRL", // Brazil
  BS: "BSD", // Bahamas
  BT: "BTN", // Bhutan: the spec's choice over the Indian rupee.
  BW: "BWP", // Botswana
  BZ: "BZD", // Belize
  CA: "CAD", // Canada
  CC: "AUD", // Cocos (Keeling) Islands
  CD: "CDF", // Democratic Republic of the Congo
  CF: "XAF", // Central African Republic
  CG: "XAF", // Republic of the Congo
  CH: "CHF", // Switzerland
  CI: "XOF", // Côte d'Ivoire
  CK: "NZD", // Cook Islands
  CL: "CLP", // Chile
  CM: "XAF", // Cameroon
  CO: "COP", // Colombia
  CR: "CRC", // Costa Rica
  CV: "CVE", // Cabo Verde
  CW: "XCG", // Curaçao
  CX: "AUD", // Christmas Island
  CY: "EUR", // Cyprus
  CZ: "CZK", // Czech Republic
  DE: "EUR", // Germany
  DJ: "DJF", // Djibouti
  DK: "DKK", // Denmark
  DM: "XCD", // Dominica
  DO: "DOP", // Dominican Republic
  DZ: "DZD", // Algeria
  EC: "USD", // Ecuador
  EE: "EUR", // Estonia
  EG: "EGP", // Egypt
  EH: "MAD", // Western Sahara
  ER: "ERN", // Eritrea
  ES: "EUR", // Spain
  ET: "ETB", // Ethiopia
  FI: "EUR", // Finland
  FJ: "FJD", // Fiji
  FK: "FKP", // Falkland Islands
  FM: "USD", // Micronesia
  FO: "DKK", // Faroe Islands
  FR: "EUR", // France
  GA: "XAF", // Gabon
  GB: "GBP", // United Kingdom
  GD: "XCD", // Grenada
  GE: "GEL", // Georgia
  GF: "EUR", // French Guiana
  GG: "GBP", // Guernsey
  GH: "GHS", // Ghana
  GI: "GIP", // Gibraltar
  GL: "DKK", // Greenland
  GM: "GMD", // Gambia
  GN: "GNF", // Guinea
  GQ: "XAF", // Equatorial Guinea
  GR: "EUR", // Greece
  GS: "GBP", // South Georgia and the South Sandwich Islands: the spec's choice, as CLDR has it.
  GT: "GTQ", // Guatemala
  GU: "USD", // Guam
  GW: "XOF", // Guinea-Bissau
  GY: "GYD", // Guyana
  HM: "AUD", // Heard Island and McDonald Islands
  HN: "HNL", // Honduras
  HR: "EUR", // Croatia
  HT: "HTG", // Haiti: the spec's choice over the US dollar.
  HU: "HUF", // Hungary
  ID: "IDR", // Indonesia
  IE: "EUR", // Ireland
  IL: "ILS", // Israel
  IM: "GBP", // Isle of Man
  IN: "INR", // India
  IO: "USD", // British Indian Ocean Territory
  IQ: "IQD", // Iraq
  IS: "ISK", // Iceland
  IT: "EUR", // Italy
  JE: "GBP", // Jersey
  JM: "JMD", // Jamaica
  JO: "JOD", // Jordan
  JP: "JPY", // Japan
  KE: "KES", // Kenya
  KG: "KGS", // Kyrgyzstan
  KH: "KHR", // Cambodia
  KI: "AUD", // Kiribati
  KM: "KMF", // Comoros
  KN: "XCD", // Saint Kitts and Nevis
  KR: "KRW", // South Korea
  KW: "KWD", // Kuwait
  KY: "KYD", // Cayman Islands
  KZ: "KZT", // Kazakhstan
  LA: "LAK", // Laos
  LB: "LBP", // Lebanon
  LC: "XCD", // Saint Lucia
  LI: "CHF", // Liechtenstein
  LK: "LKR", // Sri Lanka
  LR: "LRD", // Liberia
  LS: "LSL", // Lesotho: the spec's choice over the South African rand.
  LT: "EUR", // Lithuania
  LU: "EUR", // Luxembourg
  LV: "EUR", // Latvia
  LY: "LYD", // Libya
  MA: "MAD", // Morocco
  MC: "EUR", // Monaco
  MD: "MDL", // Moldova
  ME: "EUR", // Montenegro
  MG: "MGA", // Madagascar
  MH: "USD", // Marshall Islands
  MK: "MKD", // North Macedonia
  ML: "XOF", // Mali
  MN: "MNT", // Mongolia
  MP: "USD", // Northern Mariana Islands
  MR: "MRU", // Mauritania
  MS: "XCD", // Montserrat
  MT: "EUR", // Malta
  MU: "MUR", // Mauritius
  MV: "MVR", // Maldives
  MW: "MWK", // Malawi
  MX: "MXN", // Mexico
  MY: "MYR", // Malaysia
  MZ: "MZN", // Mozambique
  NA: "NAD", // Namibia: the spec's choice over the South African rand.
  NC: "XPF", // New Caledonia
  NE: "XOF", // Niger
  NF: "AUD", // Norfolk Island
  NG: "NGN", // Nigeria
  NI: "NIO", // Nicaragua
  NL: "EUR", // Netherlands
  NO: "NOK", // Norway
  NP: "NPR", // Nepal
  NR: "AUD", // Nauru
  NU: "NZD", // Niue
  NZ: "NZD", // New Zealand
  OM: "OMR", // Oman
  PA: "USD", // Panama: the spec's choice over the balboa.
  PE: "PEN", // Peru
  PG: "PGK", // Papua New Guinea
  PH: "PHP", // Philippines
  PK: "PKR", // Pakistan
  PL: "PLN", // Poland
  PM: "EUR", // Saint Pierre and Miquelon
  PN: "NZD", // Pitcairn Islands
  PR: "USD", // Puerto Rico
  PS: "ILS", // Palestine: the spec's choice over the Jordanian dinar.
  PT: "EUR", // Portugal
  PW: "USD", // Palau
  PY: "PYG", // Paraguay
  QA: "QAR", // Qatar
  RE: "EUR", // Réunion
  RO: "RON", // Romania
  RS: "RSD", // Serbia
  RW: "RWF", // Rwanda
  SA: "SAR", // Saudi Arabia
  SB: "SBD", // Solomon Islands
  SC: "SCR", // Seychelles
  SD: "SDG", // Sudan
  SE: "SEK", // Sweden
  SG: "SGD", // Singapore
  SH: "SHP", // Saint Helena, Ascension and Tristan da Cunha
  SI: "EUR", // Slovenia
  SK: "EUR", // Slovakia
  SL: "SLE", // Sierra Leone
  SM: "EUR", // San Marino
  SN: "XOF", // Senegal
  SO: "SOS", // Somalia
  SR: "SRD", // Suriname
  SS: "SSP", // South Sudan
  ST: "STN", // São Tomé and Príncipe
  SV: "USD", // El Salvador
  SZ: "SZL", // Eswatini
  TC: "USD", // Turks and Caicos Islands
  TD: "XAF", // Chad
  TG: "XOF", // Togo
  TH: "THB", // Thailand
  TJ: "TJS", // Tajikistan
  TK: "NZD", // Tokelau
  TL: "USD", // Timor-Leste
  TM: "TMT", // Turkmenistan
  TN: "TND", // Tunisia
  TO: "TOP", // Tonga
  TR: "TRY", // Türkiye
  TT: "TTD", // Trinidad and Tobago
  TV: "AUD", // Tuvalu
  TW: "TWD", // Taiwan
  TZ: "TZS", // Tanzania
  UA: "UAH", // Ukraine
  UG: "UGX", // Uganda
  UM: "USD", // United States Minor Outlying Islands
  US: "USD", // United States
  UY: "UYU", // Uruguay
  UZ: "UZS", // Uzbekistan
  VA: "EUR", // Vatican City
  VC: "XCD", // Saint Vincent and the Grenadines
  VE: "VES", // Venezuela
  VG: "USD", // British Virgin Islands
  VI: "USD", // U.S. Virgin Islands
  VN: "VND", // Vietnam
  VU: "VUV", // Vanuatu
  WF: "XPF", // Wallis and Futuna
  WS: "WST", // Samoa
  XK: "EUR", // Kosovo
  YE: "YER", // Yemen
  ZA: "ZAR", // South Africa
  ZM: "ZMW", // Zambia
  ZW: "USD", // Zimbabwe: the spec's choice over the Zimbabwe Gold.
};

/** Whether a code is written as an ISO 4217 currency code is: three capital letters, such as `EUR`. */
export function isCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** The ISO 4217 code of a Country's currency, such as `IDR` for Indonesia. Throws for a code that isn't a Country. */
export function countryCurrency(countryCode: string): string {
  const currency = COUNTRY_CURRENCIES[countryCode.toUpperCase()];
  if (!currency) throw new Error(`No Country has the code ${countryCode}.`);
  return currency;
}

// The exchange rates the daily sweep stores, one per currency, each to the US dollar. Both sources are
// free and keyless, and are asked the same plain question whoever the users are.

/** Where the rates come from: Frankfurter, then fawazahmed0's currency API when Frankfurter fails. */
export const EXCHANGE_RATE_SOURCES = {
  frankfurter: "https://api.frankfurter.dev/v2/rates?base=USD",
  fawazahmed0: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
} as const;
export type ExchangeRateSource = keyof typeof EXCHANGE_RATE_SOURCES;

/** A source that hasn't fully answered this long after it was asked has failed. */
export const EXCHANGE_RATE_TIMEOUT_MS = 10_000;
