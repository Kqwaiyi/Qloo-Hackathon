import { createTransport } from "nodemailer";

import type { EmailMessage, EmailTransport } from "./send-email";

/**
 * The team Gmail account's address, from GMAIL_USER, or undefined where it isn't set. It sends
 * every email, and it's where users write to the team.
 */
export function teamGmailAddress(): string | undefined {
  return process.env.GMAIL_USER?.trim() || undefined;
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
