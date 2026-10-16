import { createTransport } from "nodemailer";

import type { EmailMessage, EmailTransport } from "./send-email";

/**
 * Production's email transport: the team Gmail account over SMTP, with an app password. On a
 * deployment without the account's variables (a preview, say) every send fails, and nothing else.
 */
export function gmailTransportFromEnvironment(): EmailTransport {
  const user = process.env.GMAIL_USER;
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
