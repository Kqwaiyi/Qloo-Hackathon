import type { Metadata } from "next";
import Link from "next/link";

import { textLink } from "@/components/ui";
import { MINIMUM_AGE } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { GUEST_CONSULTATIONS_PER_ADDRESS, GUEST_PHOTO_CHECK_LIMIT, OUTFIT_ALLOWANCE } from "@/config/limits";
import { ROUTES } from "@/config/routes";
import { OUTFITS_PER_STYLING } from "@/config/stylings";
import { getTeamEmail } from "@/server/data/team";

import { bulletList, count, guestConsultationDeleted, LegalSection, paragraph, TeamEmailLink } from "../legal-text";

export const metadata: Metadata = { title: "Terms" };

/**
 * The Terms: the 18+ rule, the content rules, that this is a free hackathon project with no
 * affiliation with Style Icons or Brands, where Products, their prices, links and photos come
 * from, and what using it as a Guest allows. Public, with no sign-in.
 */
export default function Page() {
  const teamEmail = getTeamEmail();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className={paragraph}>
        These are the rules for using Qurator. By creating an account, or by agreeing to them on the Guest Page&apos;s
        consent sheet, you agree to them and to our{" "}
        <Link href={ROUTES.privacy} className={textLink}>
          Privacy Policy
        </Link>
        .
      </p>

      <LegalSection id="hackathon-project" title="A free hackathon project">
        <p className={paragraph}>
          Qurator is a free project, built for the Qloo LLM Hackathon by the Qurator team. It costs
          nothing, sells nothing and takes no payments.
        </p>
        <p className={paragraph}>
          {COPY.notAffiliated} Style Icons are named because Qloo finds them popular with people like you, not because they
          endorse the app.
        </p>
      </LegalSection>

      <LegalSection id="adults-only" title="Adults only">
        <p className={paragraph}>
          You must be {MINIMUM_AGE} or older to use Qurator. If we find out that an account belongs to someone
          under {MINIMUM_AGE}, we delete it with everything in it.
        </p>
      </LegalSection>

      <LegalSection id="content-rules" title="What you may upload">
        <p className={paragraph}>{COPY.contentRules}</p>
        <p className={paragraph}>If other people are in a photo, only upload it if they&apos;re fine with that.</p>
        <p className={paragraph}>
          Your photos stay yours. You let us store them and have AI process them only to make your Outfits and Previews, as
          the Privacy Policy describes, until you delete them, or as a Guest until your Guest Consultation is deleted. We may
          delete an account that breaks these rules.
        </p>
      </LegalSection>

      <LegalSection id="outfits" title="Your Outfits">
        <ul className={bulletList}>
          <li>Outfits are suggestions, made automatically by Qloo and AI. Take them as ideas, not advice.</li>
          <li>Previews are AI-generated, and may not show exactly how the real clothes would look on you.</li>
          <li>Your AI Stylist&apos;s notes are written by AI, and may not always be right.</li>
          <li>
            Each account can make up to {OUTFIT_ALLOWANCE} Outfits a day, and the whole app has daily and monthly limits.
            Don&apos;t try to get around them, or to disrupt the app or anyone else&apos;s account.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="guests" title="Using Qurator as a Guest">
        <ul className={bulletList}>
          <li>
            On the Guest Page, you can try Qurator without an account. As a Guest, you get one Guest Consultation: up to{" "}
            {OUTFITS_PER_STYLING} Outfits from your photo, with no more Outfits and no change of Budget Tier or Photo Style
            once they&apos;re shown.
          </li>
          <li>
            Each internet connection gets {count(GUEST_CONSULTATIONS_PER_ADDRESS, "Guest Consultation")} and{" "}
            {count(GUEST_PHOTO_CHECK_LIMIT, "photo check")} a day. Everyone on a shared connection, such as an office&apos;s or
            a café&apos;s Wi-Fi, shares them. Don&apos;t try to get around this: create an account for an Outfit Allowance of
            your own.
          </li>
          <li>
            Your Guest Consultation is deleted {guestConsultationDeleted}, as the Privacy Policy
            describes. {COPY.guestResultsWontCarryOver}
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="products" title="Products and prices">
        <ul className={bulletList}>
          <li>
            Each Product&apos;s name, price and link come from its seller, as our product search, Channel3, finds them. A
            price is dated with when we found or last checked it, and the seller may have changed it, or stopped selling the
            Product, since. Check the seller&apos;s own page before you buy.
          </li>
          <li>
            An Outfit made before Pieces were real Products shows each Brand&apos;s price range from Qloo&apos;s data
            instead, so check the Brand&apos;s own site for real prices.
          </li>
          <li>
            A price converted into your Country&apos;s currency is marked &ldquo;≈&rdquo;: it uses our latest daily
            exchange rates, so it&apos;s only approximate.
          </li>
          <li>
            Qurator sells none of these Products and earns nothing from its links: none of them is an affiliate link.
            Anything you buy, you buy from the Product&apos;s seller, on the seller&apos;s own terms.
          </li>
          <li>
            Product photos belong to their sellers. Qurator uses them only to draw your Previews, and never keeps them. If you
            sell a Product and want its photos taken out of Qurator, email{" "}
            <TeamEmailLink teamEmail={teamEmail} subject="Product photos" /> and we&apos;ll take them out.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="no-guarantees" title="No guarantees">
        <p className={paragraph}>
          As a hackathon project, Qurator is provided as it is, with no guarantee that it works, stays available or
          suits you. We may change it, pause it or shut it down at any time. You can delete your account whenever you like,
          in Settings.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p className={paragraph}>
          Questions about these Terms go to <TeamEmailLink teamEmail={teamEmail} subject="Terms" />.
        </p>
      </LegalSection>
    </>
  );
}
