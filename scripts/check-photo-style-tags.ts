// A live check, opt-in and never run in CI: is every Photo Style word a real Qloo `personal_style`
// tag? Qloo silently ignores a tag it doesn't know, so a misspelt word would steer nothing. It
// makes one read-only call, which answers with only the tags that exist.
//
//   npm run check:photo-style-tags

import { PHOTO_STYLES } from "@/config/consultations";
import { photoStyleTag } from "@/server/outfit-assembly/style-icons";

const apiUrl = process.env.QLOO_API_URL;
const apiKey = process.env.QLOO_API_KEY;
if (!apiUrl || !apiKey) {
  console.error("QLOO_API_URL and QLOO_API_KEY must both be set, as in .env.local.");
  process.exit(1);
}

const wanted = PHOTO_STYLES.map(photoStyleTag);
const url = new URL("/v2/insights", apiUrl);
url.searchParams.set("filter.type", "urn:tag");
url.searchParams.set("filter.tag.types", "urn:tag:personal_style:qloo");
url.searchParams.set("filter.parents.types", "urn:entity:brand");
url.searchParams.set("filter.results.tags", wanted.join(","));
url.searchParams.set("take", "50");

const response = await fetch(url, { headers: { "X-Api-Key": apiKey } });
if (!response.ok) {
  console.error(`Qloo answered ${response.status}.`);
  process.exit(1);
}
const body = (await response.json()) as { results?: { tags?: { tag_id: string }[] } };
const found = new Set(body.results?.tags?.map((tag) => tag.tag_id));
const missing = PHOTO_STYLES.filter((word) => !found.has(photoStyleTag(word)));

if (missing.length > 0) {
  console.error(`Not Qloo personal_style tags: ${missing.join(", ")}.`);
  process.exit(1);
}
console.log(`All ${PHOTO_STYLES.length} Photo Style words are Qloo personal_style tags.`);
