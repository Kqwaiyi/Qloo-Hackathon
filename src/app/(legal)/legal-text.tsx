import type { ReactNode } from "react";

import { mailto } from "@/components/mailto";
import { textLink } from "@/components/ui";
import { GUEST_CONSULTATION_DELETED_WITHIN_HOURS, GUEST_CONSULTATION_LIFETIME_SECONDS } from "@/config/guests";

// The building blocks of the Privacy Policy and the Terms.

export const paragraph = "mt-3 leading-relaxed text-stone-700";
export const bulletList = "mt-3 list-disc space-y-2 pl-5 leading-relaxed text-stone-700";
export const subheading = "mt-6 font-semibold";

export const SECONDS_PER_HOUR = 60 * 60;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** A number of something in words, such as "1 hour" or "30 days". */
export function count(amount: number, unit: string): string {
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/** The longest a Guest Consultation is kept, such as "24 hours". */
export const guestConsultationDeletedWithin = count(GUEST_CONSULTATION_DELETED_WITHIN_HOURS, "hour");

/** When a Guest Consultation is deleted, as both pages promise it: "within 24 hours, usually about 1 hour after it starts". */
export const guestConsultationDeleted = `within ${guestConsultationDeletedWithin}, usually about ${count(
  GUEST_CONSULTATION_LIFETIME_SECONDS / SECONDS_PER_HOUR,
  "hour",
)} after it starts`;

/** A titled part of the page, with an id other pages can link to (`/privacy#photos`). */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-10 scroll-mt-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The team's address, as a link that starts an email with this subject. */
export function TeamEmailLink({ teamEmail, subject }: { teamEmail: string; subject: string }) {
  return (
    <a href={mailto(teamEmail, subject)} className={`${textLink} break-all`}>
      {teamEmail}
    </a>
  );
}
