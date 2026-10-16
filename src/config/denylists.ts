// The denylists the team curates. Each entry matches by Qloo entity ID, so a namesake isn't caught
// and a misspelt Qloo name is; the name is only there to read.

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
