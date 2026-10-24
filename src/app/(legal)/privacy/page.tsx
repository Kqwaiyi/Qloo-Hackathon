import type { Metadata } from "next";
import Link from "next/link";

import { textLink } from "@/components/ui";
import {
  AGE_GATE_COOKIE_MAX_AGE_SECONDS,
  INACTIVE_ACCOUNT_LIFETIME_MONTHS,
  INACTIVITY_WARNING_NOTICE_DAYS,
  MINIMUM_AGE,
  SESSION_EXPIRES_IN_SECONDS,
  SIGN_UP_RATE_LIMIT,
  UNVERIFIED_ACCOUNT_LIFETIME_DAYS,
} from "@/config/accounts";
import { PHOTO_MAX_LONG_SIDE_PX } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { EMAIL_LOG_LIFETIME_DAYS } from "@/config/email";
import { USAGE_RECORD_LIFETIME_DAYS } from "@/config/limits";
import { ROUTES } from "@/config/routes";
import { getTeamEmail } from "@/server/data/team";

import { bulletList, count, LegalSection, paragraph, subheading, TeamEmailLink } from "../legal-text";

export const metadata: Metadata = { title: "Privacy Policy" };

const SECONDS_PER_DAY = 24 * 60 * 60;

const SECONDS_PER_HOUR = 60 * 60;

/** Each section's title by its id, in page order, for the contents list. */
const SECTION_TITLES = {
  "who-we-are": "Who we are",
  "eu-representative": "Why we have no EU representative",
  "what-we-collect": "What we collect",
  why: "Why we use it, and our legal basis",
  recipients: "Who receives it",
  transfers: "International transfers",
  retention: "How long we keep it",
  photos: "Photos",
  previews: "Previews are AI-generated",
  "content-rules": "What you may upload",
  automated: "Automated decisions",
  rights: "Your rights",
  "withdraw-consent": "Withdrawing your consent",
  complaints: "Complaints",
  "adults-only": "Adults only",
} as const;

type SectionId = keyof typeof SECTION_TITLES;

/** A section's id and title, as `LegalSection` takes them. */
function section(id: SectionId): { id: SectionId; title: string } {
  return { id, title: SECTION_TITLES[id] };
}

/**
 * The Privacy Policy, everything the spec's "Privacy Policy and Terms" section lists, with the
 * Real Products spec's product search and Product photos. Public, with no sign-in. Its retention
 * promises read their numbers from config, so they follow the rules.
 */
export default function Page() {
  const teamEmail = getTeamEmail();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className={paragraph}>
        This is how Qurator handles your personal data, in plain English. In short: we keep only what it takes to
        make your Outfits, we never sell it or use it for ads, and you can delete it whenever you like.
      </p>

      <nav aria-label="On this page" className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold">On this page</h2>
        <ol className="mt-2 text-sm sm:columns-2 sm:gap-x-6">
          {Object.entries(SECTION_TITLES).map(([id, title]) => (
            <li key={id} className="break-inside-avoid py-0.5">
              <a href={`#${id}`} className={textLink}>
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <LegalSection {...section("who-we-are")}>
        <p className={paragraph}>
          Qurator is run by the Qurator team: Kqwaiyi, AlexanderBudi and alisakujou0711.
          We&apos;re the controller of your personal data: we decide what&apos;s collected and why.
        </p>
        <p className={paragraph}>
          Our email address, <TeamEmailLink teamEmail={teamEmail} subject="Privacy" />, is the single contact for every
          privacy request and complaint: to get a copy of your data, to correct it or delete it, or to tell us something&apos;s
          wrong.
        </p>
      </LegalSection>

      <LegalSection {...section("eu-representative")}>
        <p className={paragraph}>
          The European Union&apos;s data protection law, the GDPR, asks a business outside the EU that offers its service to
          people in the EU to appoint a representative there (Article 27). Article 27(2) exempts processing that is
          occasional, doesn&apos;t include large-scale processing of special categories of data or of criminal records, and is
          unlikely to put people&apos;s rights and freedoms at risk. We rely on that exemption, because:
        </p>
        <ul className={bulletList}>
          <li>
            our processing is occasional: Qurator is a free project built for a hackathon, not an ongoing business;
          </li>
          <li>
            we process no special categories of data, and no criminal records: photos are only ever edited, never used to
            identify anyone or to infer sensitive traits (see <a href="#photos" className={textLink}>Photos</a>);
          </li>
          <li>
            the risk to you is low: we keep little, Qloo and Channel3 receive nothing that identifies you, and everything is
            deleted on the schedule below, or as soon as you ask.
          </li>
        </ul>
        <p className={paragraph}>
          The UK GDPR has the same exemption from appointing a UK representative, and we rely on it for the same reasons. Write
          to us directly instead, at <TeamEmailLink teamEmail={teamEmail} subject="Privacy" />.
        </p>
      </LegalSection>

      <LegalSection {...section("what-we-collect")}>
        <p className={paragraph}>We keep:</p>
        <ul className={bulletList}>
          <li>
            your username, your email address, and your password, stored only as a hash, never as you typed it;
          </li>
          <li>
            your birth year and month. Sign-up asks for your whole date of birth to check you&apos;re {MINIMUM_AGE} or older,
            then drops the day;
          </li>
          <li>your Style Preference and Country;</li>
          <li>your photos and the Previews made from them, with each Consultation&apos;s Outfits;</li>
          <li>
            your AI Stylist&apos;s notes on each Styling: the short notes it writes to you as it styles you, and a line for each
            search it makes and Preview it draws;
          </li>
          <li>
            what the photo check found: the Photo Style, which parts of you the photo shows (face, hair, upper body, legs and
            feet), and whether your hair is covered, as a yes or no, never what covers it;
          </li>
          <li>
            usage records: the time of each Outfit made and each photo checked, so the daily limits work. They hold no photo
            and nothing of the Outfit.
          </li>
        </ul>
        <p className={paragraph}>To keep your account running and safe, we also keep:</p>
        <ul className={bulletList}>
          <li>your sign-ins: for each device you&apos;re signed in on, its IP address and browser;</li>
          <li>IP addresses, briefly, to limit repeated attempts at signing up, signing in and other account actions;</li>
          <li>which version of the photo notice on the consent sheet you agreed to, and when;</li>
          <li>a log of the emails we send you: which kind, and when, but never the address;</li>
          <li>when you last used the app, so that accounts nobody uses can be deleted.</li>
        </ul>
        <p className={paragraph}>
          We also check which country your connection comes from, to make sure the app is available there, without storing
          it. We use only the cookies the app needs: one that keeps you signed in, and, if a date of birth under{" "}
          {MINIMUM_AGE} is entered at sign-up, one that stops another try from that browser for{" "}
          {count(AGE_GATE_COOKIE_MAX_AGE_SECONDS / SECONDS_PER_DAY, "day")}.
        </p>
        <h3 className={subheading}>What you have to give us</h3>
        <p className={paragraph}>
          An account needs your username, email, password, date of birth, Style Preference and Country. Without them we
          can&apos;t run your account, check your age or pick Outfits for you. <strong>A photo is required to get Outfits</strong>,
          since every Outfit is built from one. You can have an account without ever sending a photo.
        </p>
      </LegalSection>

      <LegalSection {...section("why")}>
        <ul className={bulletList}>
          <li>
            <strong>To run your account:</strong> signing you in, emailing your verification and password links and notices
            about your account, and keeping your Consultations for you. Legal basis: our contract with you (GDPR Article
            6(1)(b)), since you asked for the account.
          </li>
          <li>
            <strong>To keep the app for adults only,</strong> from your birth year and month. Legal basis: our contract with
            you, and our legitimate interest (Article 6(1)(f)) in following Google&apos;s terms for Gemini, which don&apos;t
            allow anyone under {MINIMUM_AGE}.
          </li>
          <li>
            <strong>To pick your Outfits,</strong> from your age group (worked out from your birth year and month), Style
            Preference and Country, and each Consultation&apos;s Photo Style and Budget Tier. Legal basis: our contract with
            you.
          </li>
          <li>
            <strong>To check your photos, tailor your Outfits to them, draw your Previews and keep them in your history,</strong>{" "}
            from your photos and what the check found. Legal basis: your consent (Article 6(1)(a)), given on the consent sheet
            before your first Consultation. You can{" "}
            <a href="#withdraw-consent" className={textLink}>
              withdraw it
            </a>{" "}
            at any time.
          </li>
          <li>
            <strong>To keep a free app affordable and fair,</strong> from usage records, which the daily limits and the
            app&apos;s overall limits count, and the email log, which keeps our emails within what Gmail allows. Legal basis:
            our legitimate interest in keeping the app running for everyone.
          </li>
          <li>
            <strong>To keep your account secure,</strong> from your sign-ins and IP addresses. Legal basis: our legitimate
            interest in protecting your account and the app.
          </li>
          <li>
            <strong>To stop automated sign-ups,</strong> from your IP address and your browser&apos;s details, which Cloudflare
            reads on the forms for signing up, signing in and asking for a password reset (the Bot Check). Legal basis: our
            legitimate interest (Article 6(1)(f)) in keeping the app&apos;s overall limits and our emails for real people, not
            scripts.
          </li>
          <li>
            <strong>To delete accounts nobody uses,</strong> from when you last used the app. Legal basis: our legitimate
            interest in keeping no data longer than we need it.
          </li>
        </ul>
        <p className={paragraph}>We don&apos;t sell your data, show ads, or use analytics or tracking.</p>
      </LegalSection>

      <LegalSection {...section("recipients")}>
        <ul className={bulletList}>
          <li>
            <strong>Anthropic&apos;s Claude</strong>, one of our two AI providers, gets your photos as our processor, to check
            each one and read its Photo Style, and runs your AI Stylist. As your AI Stylist, it gets with your photo only what
            it needs to make your Outfits: the Photo Type, your age group, the Photo Style, the Style Icons&apos; names,
            whether each Outfit is menswear or womenswear, the Brands, and the names, descriptions and colours of the
            Brands&apos; Products to pick from. To check each Preview, it also gets the Preview, any redraw of it, and the
            seller&apos;s own photo of each of its Products, fetched by the photo&apos;s link (see{" "}
            <a href="#previews" className={textLink}>
              Previews are AI-generated
            </a>
            ). It never gets your username, email or Country, and gets your Budget Tier only when you change it.
            Anthropic deletes what it gets within 30 days, but keeps anything its trust and safety team flags as breaking its
            usage policy for up to 2 years. It doesn&apos;t use any of it to train its models.
          </li>
          <li>
            <strong>Google&apos;s Gemini</strong>, our other AI provider, gets your photos as our processor. With each one it
            gets only what it needs to draw an Outfit&apos;s Preview: the Photo Type, the Hairstyle&apos;s cut, the names and
            sellers&apos; photos of the Products picked, and for a redraw, your AI Stylist&apos;s note on what to put right (see{" "}
            <a href="#previews" className={textLink}>
              Previews are AI-generated
            </a>
            ). It never gets your username, email, Country or Budget Tier. Google keeps a copy for 55 days to detect abuse,
            and doesn&apos;t use it to improve its products.
          </li>
          <li>
            <strong>Qloo</strong>, which picks the Style Icons and Brands, gets only your age group, a gender signal
            (menswear or womenswear, from your Style Preference), your Country, the Photo Style&apos;s tags, and the IDs of
            Style Icons and Brands. It never gets your username, email, user ID or photo, or anything that links two requests
            to you.
          </li>
          <li>
            <strong>Channel3</strong>, our product search, finds the real Products each Brand sells. It gets only the Brand
            (its name and website), the Category, whether the Outfit is menswear or womenswear, the Brand&apos;s price range,
            and the country searched, which comes from your Country. When you open a Consultation later, it gets its
            Products&apos; IDs and the country each was found in, to check their prices. It never gets your photo or anything
            about your account: not your username, email or user ID, or anything that links two requests to you.
          </li>
          <li>
            <strong>Our hosting, database and storage providers:</strong> Vercel hosts the app, stores your photos and
            Previews, and runs each Styling, and Neon hosts the database. They handle your data only for us.
          </li>
          <li>
            <strong>Gmail:</strong> our emails go out through the team&apos;s Gmail account, so your email address passes
            through Gmail under Google&apos;s own privacy policy.
          </li>
          <li>
            <strong>Cloudflare</strong> runs the Bot Check with its Turnstile service. On the forms for signing up, signing in
            and asking for a password reset, it gets your IP address, your browser&apos;s details (its TLS fingerprint and
            user agent) and the site&apos;s address, to check that you&apos;re not a bot, even if you don&apos;t send the
            form. It never gets what you type in it. Cloudflare handles this as our processor, and also as a controller,
            under its own privacy policy, to improve its bot detection.
          </li>
        </ul>
        <p className={paragraph}>Nobody else gets your data, unless the law requires it.</p>
      </LegalSection>

      <LegalSection {...section("transfers")}>
        <p className={paragraph}>
          The app, its database and its photo storage run in the eastern United States. Anthropic and Google may handle what
          Claude and Gemini receive in any country where they have facilities, and Cloudflare may handle what it receives
          for the Bot Check outside your country. So if you&apos;re in the European Economic Area, the UK or another country
          with rules on sending personal data abroad, your data leaves that country.
        </p>
        <p className={paragraph}>
          Those transfers are protected by each provider&apos;s data processing terms, which use safeguards such as the
          European Commission&apos;s Standard Contractual Clauses and the UK&apos;s addendum to them. Email addresses in Gmail
          are covered by Google&apos;s own privacy policy and its safeguards, and Cloudflare&apos;s own privacy policy
          likewise covers what it uses to improve its bot detection. Qloo, also in the United States, receives nothing that
          identifies you, and nor does Channel3.
        </p>
      </LegalSection>

      <LegalSection {...section("retention")}>
        <ul className={bulletList}>
          <li>
            <strong>Consultations</strong>, with their photos, Outfits and Previews: until you delete them, withdraw photo
            consent, or your account is deleted.
          </li>
          <li>
            <strong>Your AI Stylist&apos;s notes</strong> on a Styling: as long as the Outfits they explain are shown, so
            they&apos;re deleted once a new Styling&apos;s Outfits replace those. If a Styling makes no Outfits, its notes
            stay under the line saying so until a later Styling finishes, or go at once for &ldquo;Show 2 more
            Outfits&rdquo;, which has no such line. Either way, they&apos;re deleted with their Consultation.
          </li>
          <li>
            <strong>Your account</strong>: until you delete it. An account with no activity for{" "}
            {INACTIVE_ACCOUNT_LIFETIME_MONTHS} months is deleted with everything in it, after a warning email{" "}
            {INACTIVITY_WARNING_NOTICE_DAYS} days before.
          </li>
          <li>
            <strong>An account whose email is never verified</strong>: deleted {UNVERIFIED_ACCOUNT_LIFETIME_DAYS} days after
            sign-up.
          </li>
          <li>
            <strong>Usage records</strong>: about {USAGE_RECORD_LIFETIME_DAYS} days. If your account is deleted first, they
            lose any link to you.
          </li>
          <li>
            <strong>The email log</strong>: about {EMAIL_LOG_LIFETIME_DAYS} days, and likewise.
          </li>
          <li>
            <strong>Sign-ins</strong>: until you sign out, or your account is deleted. A sign-in stops working{" "}
            {count(SESSION_EXPIRES_IN_SECONDS / SECONDS_PER_DAY, "day")} after you last used the app on that device.
          </li>
          <li>
            {/* Better Auth clears a count once it's older than the longest rate-limit window: sign-up's. */}
            <strong>Counts of repeated attempts from an IP address</strong>: about{" "}
            {count(SIGN_UP_RATE_LIMIT.window / SECONDS_PER_HOUR, "hour")}.
          </li>
          <li>
            <strong>Anthropic&apos;s copy</strong> of what Claude receives: deleted within 30 days, or kept for up to 2 years if
            its trust and safety team flags it.
          </li>
          <li>
            <strong>Google&apos;s abuse-monitoring copy</strong> of what Gemini receives and makes: 55 days.
          </li>
          <li>
            <strong>Workflow run data</strong>, Vercel&apos;s record of each Styling&apos;s steps: while a Styling runs, it
            holds your photo, its Previews and the AI Stylist&apos;s conversation, with the Style Icons and the Pieces&apos;
            text, all encrypted. None of it can be read once the Styling ends, and every copy is gone within 36 days. It
            holds the Product photos only by their links, never the photos themselves.
          </li>
          <li>
            <strong>Database backups</strong>: Neon&apos;s restore window keeps earlier states of the database for 6 hours.
          </li>
          <li>
            <strong>Runtime logs</strong>, Vercel&apos;s record of each request to the app: 1 day.
          </li>
          <li>
            <strong>Copies of the emails we send you</strong>, in the team Gmail&apos;s Sent folder: purged daily, so none is
            kept more than about two days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...section("photos")}>
        <h3 className={subheading}>Biometric notice</h3>
        <p className={paragraph}>
          To check your photo, tailor your Outfits and draw your Previews, AI processes your face and body. Some laws treat
          that as collecting biometric information, such as the geometry of your face. The AI does it only to edit the image:
          never to identify you, recognise you in another photo, or sign you in.
        </p>
        <h3 className={subheading}>What we never do</h3>
        <ul className={bulletList}>
          <li>We build no face templates, faceprints or anything like them, and keep none.</li>
          <li>Nothing guesses your age from your photo: your age group comes from the birth year and month you gave us.</li>
          <li>
            Nothing infers your ethnicity, skin tone, body measurements, health or religion from it. The check notes whether
            your hair is covered, never what covers it.
          </li>
        </ul>
        <h3 className={subheading}>Your release</h3>
        <p className={paragraph}>
          Before your first Consultation, and again whenever this notice changes, the consent sheet asks you to tick two boxes,
          both unticked to start with. Ticking the first is your written release: you agree to us storing your photos and
          Previews and having AI process your face and body, for the purpose and the time described here. Ticking the second
          agrees to your photos being sent to Anthropic&apos;s Claude and Google&apos;s Gemini. We record which version you
          agreed to, and when.
        </p>
        <h3 className={subheading}>Other people in your photo</h3>
        <p className={paragraph}>
          If anyone else is in your photo, they&apos;re stored and sent to Anthropic&apos;s Claude and Google&apos;s Gemini
          with it, because the check looks at the whole photo and your Previews edit it as it is. Only its Main Person, the
          one the photo is clearly of, is styled. Nobody else in it is ever styled, read or identified, nothing about them
          is kept from the check, and they&apos;re deleted with the Consultation. Your release covers only you, so please
          make sure you have the consent of everyone else in a photo before you send it.
        </p>
        <h3 className={subheading}>Before a photo leaves your device</h3>
        <p className={paragraph}>
          Your browser redraws every photo before sending it, as a JPEG at most {PHOTO_MAX_LONG_SIDE_PX} pixels on its long
          side. Redrawing drops the hidden metadata a photo can carry, such as the GPS location where it was taken. Only a photo
          that passes the check is stored, and only someone signed in to your account can open it, through private links that
          soon expire.
        </p>
        <h3 className={subheading}>How long photos are kept, and how they&apos;re destroyed</h3>
        <p className={paragraph}>
          Your photos and Previews are kept until you delete their Consultation, withdraw photo consent, or your account is
          deleted, including after {INACTIVE_ACCOUNT_LIFETIME_MONTHS} months without activity. Then:
        </p>
        <p className="mt-3 rounded-lg border border-stone-200 bg-white px-4 py-3 font-medium leading-relaxed">
          {COPY.deletionPromise}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <caption className="sr-only">Where copies are kept, and when they go</caption>
            <thead>
              <tr className="border-b border-stone-300">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Where
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Gone
                </th>
              </tr>
            </thead>
            <tbody className="text-stone-700">
              <PhotoScheduleRow where="Our photo storage (Vercel Blob): the photo and its Previews" gone="Immediately" />
              <PhotoScheduleRow
                where="Our database: the Consultation, its Outfits, the AI Stylist's notes and what the check found"
                gone="Immediately, and from backups within 6 hours"
              />
              <PhotoScheduleRow
                where="Workflow run data: the photo, its Previews and the AI Stylist's conversation, encrypted, while a Styling runs"
                gone="Unreadable once its Styling ends or is stopped, and every copy gone within 36 days"
              />
              <PhotoScheduleRow where="Runtime logs, which never hold the images" gone="Within a day" />
              <PhotoScheduleRow
                where="Anthropic's copy of the photo and Previews"
                gone="Within 30 days of being sent, or up to 2 years if its trust and safety team flags it"
              />
              <PhotoScheduleRow
                where="Google's abuse-monitoring copy of the photo and Previews"
                gone="Within 55 days of being sent or made"
              />
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection {...section("previews")}>
        <p className={paragraph}>
          A Preview is made by AI: it edits your photo to show you wearing an Outfit. Every Preview is labelled &ldquo;
          {COPY.aiGenerated}&rdquo; wherever the app shows it. It&apos;s an illustration of how the Outfit could look on you,
          not a photo of you in the real clothes.
        </p>
        <p className={paragraph}>
          Your AI Stylist checks each Preview against your photo and its Products&apos; photos. When one is wrong, it has it
          drawn once more, with a note on what to put right, and keeps the better of the two. When neither shows you as you
          are, it leaves that Outfit without a Preview.
        </p>
        <p className={paragraph}>
          Each Product in a Preview is drawn from its seller&apos;s own photo of it, or from its name when that photo
          can&apos;t be fetched. To draw a Preview, the app fetches those photos and sends them to Google&apos;s Gemini with
          your photo. Once your AI Stylist has the Preview to check, the app fetches them again, by their links, each time
          it sends Anthropic&apos;s Claude the Styling&apos;s conversation with the Preview in it, until the Styling ends. It
          fetches them only to send them, and never keeps them: no Product photo is stored with your photos, in our
          database, in our logs or in a Styling&apos;s run data, which holds only their links.
        </p>
      </LegalSection>

      <LegalSection {...section("content-rules")}>
        <p className={paragraph}>{COPY.contentRules}</p>
        <p className={paragraph}>
          The photo check turns down explicit photos, and a photo it turns down is never stored. A Body-Only Photo can still
          show your face: if it does, your face is processed with the rest of the photo, and left as it is in your Previews.
        </p>
      </LegalSection>

      <LegalSection {...section("automated")}>
        <p className={paragraph}>
          Your Outfits are recommended automatically, with no person involved. AI reads the Photo Style from your photo. Qloo
          then picks Style Icons and Brands from your age group, Style Preference and Country and that Photo Style. Channel3
          finds each Brand&apos;s real Products, and AI picks those that suit your photo, tailors any Hairstyle to it and
          draws each Preview. The photo check is automated too, and can turn a photo down.
        </p>
        <p className={paragraph}>
          None of this has a legal or similarly significant effect on you: it only suggests clothes and haircuts. You can
          change the Photo Style and the Budget Tier on any Consultation, and your Style Preference and Country in Settings.
        </p>
      </LegalSection>

      <LegalSection {...section("rights")}>
        <p className={paragraph}>
          You have the right to access your data, to correct it, to have it deleted, to restrict how we use it, to object to
          how we use it, and to have a copy of it to take elsewhere.
        </p>
        <ul className={bulletList}>
          <li>
            <strong>A copy of your data</strong>, to see or to take elsewhere: email{" "}
            <TeamEmailLink teamEmail={teamEmail} subject="My data" />. We answer within a month.
          </li>
          <li>
            <strong>Correcting it:</strong> change your username, Style Preference, Country, email or password in Settings. For
            your date of birth, or anything else, email us. We answer within a month.
          </li>
          <li>
            <strong>Deleting it:</strong> delete any Consultation from My Consultations, or your whole account in Settings,
            and it&apos;s deleted right away, as{" "}
            <a href="#photos" className={textLink}>
              Photos
            </a>{" "}
            describes. If you email us to delete it instead, we do it within 30 days.
          </li>
          <li>
            <strong>Restricting or objecting to how we use it:</strong> email us. We answer within a month.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...section("withdraw-consent")}>
        <p className={paragraph}>
          You can withdraw your consent to us storing and processing your photos at any time: in{" "}
          <Link href={ROUTES.settings} className={textLink}>
            Settings
          </Link>
          , under Privacy, choose &ldquo;{COPY.withdrawPhotoConsent}&rdquo;. That deletes every Consultation, with its photos,
          Outfits and Previews, and keeps your account. The consent sheet then comes back before your next Consultation.
          Withdrawing doesn&apos;t affect what we did with your consent before you withdrew it.
        </p>
      </LegalSection>

      <LegalSection {...section("complaints")}>
        <p className={paragraph}>
          If you&apos;re unhappy with how we handle your data, email{" "}
          <TeamEmailLink teamEmail={teamEmail} subject="Privacy complaint" />. We answer every complaint within 30 days.
        </p>
        <p className={paragraph}>
          You also have the right to complain to a data protection supervisory authority, such as the one where you live or
          work. In the UK, that&apos;s the Information Commissioner&apos;s Office.
        </p>
      </LegalSection>

      <LegalSection {...section("adults-only")}>
        <p className={paragraph}>
          Qurator is for adults: you must be {MINIMUM_AGE} or older to use it. Sign-up asks for your date of birth.
          A date under {MINIMUM_AGE} creates no account and we keep nothing of it: only a cookie in that browser stops another
          try for {count(AGE_GATE_COOKIE_MAX_AGE_SECONDS / SECONDS_PER_DAY, "day")}. If we find out that an account belongs to someone under {MINIMUM_AGE},
          we delete it with everything in it. To tell us about one, email{" "}
          <TeamEmailLink teamEmail={teamEmail} subject={`An account of someone under ${MINIMUM_AGE}`} />.
        </p>
        <p className={paragraph}>
          See also our{" "}
          <Link href={ROUTES.terms} className={textLink}>
            Terms
          </Link>
          .
        </p>
      </LegalSection>
    </>
  );
}

function PhotoScheduleRow({ where, gone }: { where: string; gone: string }) {
  return (
    <tr className="border-b border-stone-200 align-top">
      <td className="py-2 pr-4">{where}</td>
      <td className="py-2">{gone}</td>
    </tr>
  );
}
