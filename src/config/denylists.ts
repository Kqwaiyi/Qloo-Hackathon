// The denylists the team curates: Qloo entities, then throwaway-inbox domains.

import { SEEDED_DISPOSABLE_ADDRESS_DOMAINS } from "./disposable-address-domains";

/**
 * A Qloo entity on a denylist. It matches by Qloo entity ID, so a namesake isn't caught and a
 * misspelt Qloo name is; the name is only there to read.
 */
export interface DenylistEntry {
  entityId: string;
  name: string;
}

/**
 * People who are never a Style Icon: anyone with an adult-film background, a political role, no
 * fashion relevance, or a serious legal or hate-speech controversy, that the query's exclusions miss.
 */
export const STYLE_ICON_DENYLIST: readonly DenylistEntry[] = [
  // Died in 2024, but Qloo has no date of death for him, under a misspelt name.
  { entityId: "8D14B185-0229-46EC-B024-C7B50980DBBF", name: "Liam Payne (Qloo: Liam Pane)" },
  // YouTubers and comedians the exclusion tags miss.
  { entityId: "30A28964-F596-4261-BBA7-E0E3F7D90385", name: "KSI" },
  { entityId: "C76892A1-68A3-4CCF-9674-90A959D297E1", name: "Shane Dawson" },
  { entityId: "6F387AA3-8650-40E1-AD9F-6A470F0C1FEF", name: "Jeffree Star" },
  { entityId: "D9DC503E-1BD7-42E3-9F60-BAACD686E300", name: "Colleen Ballinger" },
  { entityId: "28C98B21-9E7C-4AB1-86F1-52ACCD45B912", name: "Liza Koshy" },
  // Serious legal controversies.
  { entityId: "EE4FF0D8-3C56-4F74-8511-9C84F4CB615F", name: "Sean Combs" },
  { entityId: "3DF11321-1AB2-4B06-8AEB-F8720AFE7CC3", name: "6ix9ine" },
  { entityId: "CB6258A6-C9B8-45C8-81CD-45D6077DD981", name: "Conor McGregor" },
  // An odd entity: its record doesn't match the singer it's named after.
  { entityId: "3EC8FC0E-0EA1-432F-9A6D-170E1A210A5B", name: "Rihanna Galliquio" },
];

// The Brand denylists. Their IDs were looked up through read-only Qloo searches on 2026-10-17.

/**
 * Multi-brand stores, never a Brand an Outfit is built on. Most carry `genre:brand:fashion`, so
 * the Brand query keeps them. A few, such as Foot Locker, are tagged only as retail, so the query
 * already drops them; they're here in case Qloo's tags change.
 */
export const RETAILER_DENYLIST: readonly DenylistEntry[] = [
  { entityId: "BC0CE285-8053-4D87-9091-16F79874814B", name: "Farfetch" },
  { entityId: "28FDFABF-8695-4DE6-9115-BF19EFE7C8F7", name: "Net-a-Porter (Qloo: Net a porter)" },
  { entityId: "4950A958-7A9B-4733-8930-7BBE2DBD183F", name: "MR PORTER" },
  { entityId: "4D260F12-9D7F-4481-A20E-3AACAC4E3953", name: "Mytheresa (Qloo: My Theresa)" },
  { entityId: "251EC16B-0469-48A1-9EDF-86A756D5F0C4", name: "Neiman Marcus" },
  { entityId: "65246A9E-5A65-432C-8B3C-45D50702F28A", name: "Harvey Nichols" },
  { entityId: "4C160FEA-FDB6-4DEC-99FC-13899680A0F4", name: "Foot Locker" },
  { entityId: "B369CDDB-DA94-41CF-847B-E21729EB60CB", name: "Champs Sports" },
  { entityId: "458D3BED-B4E9-472D-9156-B21DDC6EDEDF", name: "Flight Club" },
  { entityId: "20EEC96F-0433-43A7-93C7-F1BA5851D056", name: "END. Clothing" },
  { entityId: "0C3BD729-7828-4B25-A1A5-3748268A1CD7", name: "Zumiez" },
  { entityId: "080BDB92-1BD6-4FC3-B176-BC5D53D19456", name: "Tillys" },
  { entityId: "3F6705CE-D208-4810-B497-50E89B1A7C23", name: "Selfridges" },
  // Brazilian department and online stores.
  { entityId: "BED0C96D-D0C3-4E32-B26E-233BD2206AD7", name: "Lojas Renner" },
  { entityId: "7579D747-D506-49C7-A20F-BBFC2FD6C32F", name: "Zattini" },
];

/** Brands tagged apparel or footwear that still can't be an everyday Top, Bottom or Shoes. */
export const OFF_CATEGORY_DENYLIST: readonly DenylistEntry[] = [
  // Merch shops.
  { entityId: "1C3B73F4-DEFA-48F3-A5CD-0AA97AE36CD6", name: "Kylie Jenner Shop" },
  // Shapewear.
  { entityId: "7F9BB603-586C-4601-952F-9E547E6999B5", name: "Skims" },
  // Bridal labels.
  { entityId: "725D8C8B-3643-4E0D-ADCF-3BA8EEAE3C81", name: "Galia Lahav" },
  { entityId: "B840097A-75D4-4BEC-BA31-C72A92F6993E", name: "Berta" },
  { entityId: "69B3A4F0-019F-442F-A722-88118A19FEBF", name: "Muse by Berta" },
  // Flip-flops.
  { entityId: "433AF5FB-C10A-42B6-AEDC-257B43D4EA19", name: "Havaianas" },
];

/**
 * The domains of throwaway-inbox services. An address at one of them, or at a subdomain of one, is
 * a Disposable Address, which no account may sign up with or change to. Most come from the seeded
 * list, whose file says where it comes from and how to refresh it.
 */
export const DISPOSABLE_ADDRESS_DOMAINS: readonly string[] = [
  ...SEEDED_DISPOSABLE_ADDRESS_DOMAINS,
  // Domains the seeded list misses go here, so a refresh keeps them.
];
