import { createTransport } from "nodemailer";

import type { EmailMessage, EmailTransport } from "./send-email";

/** The team Gmail account's address, from GMAIL_USER, or undefined where it isn't set. It sends every email. */
export function teamGmailAddress(): string | undefined {
  return process.env.GMAIL_USER?.trim() || undefined;
}

/** The team's address where GMAIL_USER isn't set (previews, and local development without .env.local). It goes nowhere. */
const UNSET_TEAM_EMAIL = "team@outfit-recommender.invalid";

/**
 * Where users write to the team: for a copy of their data, a correction, a complaint, or a change
 * they didn't make. The team Gmail account's address, or one that goes nowhere where it isn't set.
 */
export function teamEmailAddress(): string {
  return teamGmailAddress() ?? UNSET_TEAM_EMAIL;
}

/**
 * Production's email transport: the team Gmail account over SMTP, with an app password. On a
 * deployment without the account's variables (a preview, say) every send fails, and nothing else.
 */
export function gmailTransportFromEnvironment(): EmailTransport {
  const user = teamGmailAddress();
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return {
      send: async () => {
        throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are not set.");
      },
    };
  }
  const transporter = createTransport({ service: "gmail", auth: { user, pass } });
  return {
    async send(message: EmailMessage) {
      await transporter.sendMail({
        from: { name: message.fromName, address: user },
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}
