import type { EmailMessage, EmailTransport } from "./send-email";

/** The email transport in tests: it keeps every message sent instead of delivering it. */
export class CapturingEmailTransport implements EmailTransport {
  readonly messages: EmailMessage[] = [];
  /** When set, every send fails with this error, as an SMTP server refusing it would. */
  failWith?: Error;
  /** Sends to these addresses (lowercased) fail, as an SMTP server refusing the recipient would. */
  readonly refusedRecipients = new Set<string>();
  /** When set, runs while each message is on its way, as something else happening meanwhile would. */
  duringSend?: (message: EmailMessage) => Promise<void>;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    if (this.refusedRecipients.has(message.to.toLowerCase())) throw new Error("The recipient was refused.");
    await this.duringSend?.(message);
    this.messages.push(message);
  }

  /** The messages sent to this address, oldest first. */
  to(address: string): EmailMessage[] {
    return this.messages.filter((message) => message.to.toLowerCase() === address.toLowerCase());
  }
}
