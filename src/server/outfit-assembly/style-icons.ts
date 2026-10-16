import { type Line, LINES, type StylePreference } from "@/config/accounts";
import type { AgeGroup, PhotoStyle, PhotoStyleWords } from "@/config/consultations";
import { STYLE_ICON_DENYLIST } from "@/config/denylists";
import {
  STYLE_ICON_EXCLUDED_TAGS,
  STYLE_ICON_OCCUPATION_TAGS,
  STYLE_ICON_POPULARITY_FLOOR,
  STYLE_ICONS_PER_CALL,
} from "@/config/qloo";
import type { QlooPerson, QlooQuery, QlooTagId } from "@/server/qloo/client";

import { consultationCountry, lineGender, qlooAge } from "./signals";

// Picking Style Icons (spec: "Outfit assembly", Style Icons): the person query for each line, and
// the ranked Style Icons from what Qloo sends back. Pure: the caller fetches and saves.

/** What a Consultation's Style Icon query is built from. */
export interface StyleIconSearch {
  ageGroup: AgeGroup;
  countryCode: string;
  photoStyle: PhotoStyleWords;
}

/** A Style Icon, with the line that inspires its Outfit. */
export interface RankedStyleIcon {
  entityId: string;
  name: string;
  line: Line;
}

/** The lines a user's Style Icons come from: one person call each. */
export function styleIconLines(stylePreference: StylePreference): Line[] {
  return stylePreference === "no_preference" ? [...LINES] : [stylePreference];
}

/** The person query for one line. Qloo's client adds `filter.type=urn:entity:person`. */
export function styleIconQuery({ ageGroup, countryCode, photoStyle }: StyleIconSearch, line: Line): QlooQuery {
  return {
    "filter.tags": STYLE_ICON_OCCUPATION_TAGS,
    "filter.exclude.tags": STYLE_ICON_EXCLUDED_TAGS,
    "filter.gender": lineGender(line),
    "signal.demographics.gender": lineGender(line),
    "signal.demographics.age": qlooAge(ageGroup),
    "signal.location.query": consultationCountry(countryCode).qlooLocation,
    "signal.interests.tags": photoStyle.map(photoStyleTag),
    "filter.popularity.min": STYLE_ICON_POPULARITY_FLOOR,
    take: STYLE_ICONS_PER_CALL,
  };
}

/** The Qloo `personal_style` tag for a Photo Style word. */
export function photoStyleTag(word: PhotoStyle): QlooTagId {
  return `urn:tag:personal_style:qloo:${word}`;
}

const DENYLISTED = new Set(STYLE_ICON_DENYLIST.map((entry) => entry.entityId));

/**
 * The Style Icons, best first, from each line's person call: anyone with a date of death or on the
 * denylist dropped, in Qloo's affinity order, and a no-preference user's two lines interleaved
 * (W1, M1, W2, M2…). Someone in both lists keeps their first place.
 */
export function rankStyleIcons(peopleByLine: Partial<Record<Line, readonly QlooPerson[]>>): RankedStyleIcon[] {
  const lists = LINES.map((line) =>
    byAffinity((peopleByLine[line] ?? []).filter((person) => !person.hasDateOfDeath && !DENYLISTED.has(person.entityId))).map(
      ({ entityId, name }): RankedStyleIcon => ({ entityId, name, line }),
    ),
  );
  const ranked = new Map<string, RankedStyleIcon>();
  const longest = Math.max(...lists.map((list) => list.length));
  for (let rank = 0; rank < longest; rank += 1) {
    for (const list of lists) {
      const icon = list[rank];
      if (icon && !ranked.has(icon.entityId)) ranked.set(icon.entityId, icon);
    }
  }
  return [...ranked.values()];
}

/** Highest affinity first. Anyone without one goes last, keeping Qloo's order. */
function byAffinity(people: readonly QlooPerson[]): QlooPerson[] {
  const affinity = (person: QlooPerson) => person.affinity ?? Number.NEGATIVE_INFINITY;
  return people.toSorted((a, b) => (affinity(a) === affinity(b) ? 0 : affinity(a) > affinity(b) ? -1 : 1));
}
