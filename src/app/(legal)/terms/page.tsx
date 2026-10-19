import type { Metadata } from "next";
import Link from "next/link";

import { textLink } from "@/components/ui";
import { MINIMUM_AGE } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { ROUTES } from "@/config/routes";
import { getTeamEmail } from "@/server/data/team";

import { bulletList, LegalSection, paragraph, TeamEmailLink } from "../legal-text";

export const metadata: Metadata = { title: "Terms" };

/**
 * The Terms: the 18+ rule, the content rules, and that this is a free hackathon project with no
 * affiliation with Style Icons or Brands. Public, with no sign-in.
 */
export default function Page() {
  const teamEmail = getTeamEmail();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className={paragraph}>
        These are the rules for using Qurator. By creating an account, you agree to them and to our{" "}
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
          endorse the app. Each Brand links to its own website, with no affiliate links, and its price range comes from
          Qloo&apos;s data, so check the Brand&apos;s own site for real prices.
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
        <p className={paragraph}>
          Your photos stay yours. You let us store them and have AI process them only to make your Outfits and Previews, as
          the Privacy Policy describes, until you delete them. We may delete an account that breaks these rules.
        </p>
      </LegalSection>

      <LegalSection id="outfits" title="Your Outfits">
        <ul className={bulletList}>
          <li>Outfits are suggestions, made automatically by Qloo and AI. Take them as ideas, not advice.</li>
          <li>Previews are AI-generated, and may not show exactly how the real clothes would look on you.</li>
          <li>
            Each account can make up to {OUTFIT_ALLOWANCE} Outfits a day, and the whole app has daily and monthly limits.
            Don&apos;t try to get around them, or to disrupt the app or anyone else&apos;s account.
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
