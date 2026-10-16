import type { EmailMessage, EmailTransport } from "./send-email";

/** The email transport in tests: it keeps every message sent instead of delivering it. */
export class CapturingEmailTransport implements EmailTransport {
  readonly messages: EmailMessage[] = [];
  /** When set, every send fails with this error, as an SMTP server refusing it would. */
  failWith?: Error;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.messages.push(message);
  }

  /** The messages sent to this address, oldest first. */
  to(address: string): EmailMessage[] {
    return this.messages.filter((message) => message.to.toLowerCase() === address.toLowerCase());
  }
}
