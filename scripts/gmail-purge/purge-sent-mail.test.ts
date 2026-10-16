import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("./Code.gs", import.meta.url), "utf8");
const HOUR_MS = 60 * 60 * 1000;

interface MailboxMessage {
  id: string;
  labelIds: string[];
  sentAt: Date;
}

interface ListOptions {
  labelIds?: string[];
  q?: string;
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
}

/** The Gmail advanced service over an in-memory mailbox, keeping to the API's documented list and delete rules. */
class FakeGmail {
  readonly mailbox = new Map<string, MailboxMessage>();
  readonly Users = {
    Messages: {
      list: (userId: string, options: ListOptions = {}) => this.list(userId, options),
      batchDelete: (resource: { ids: string[] }, userId: string) => this.batchDelete(resource, userId),
    },
  };

  constructor(messages: MailboxMessage[]) {
    for (const message of messages) this.mailbox.set(message.id, message);
  }

  private list(userId: string, options: ListOptions) {
    expect(userId).toBe("me");
    const before = parseBefore(options.q);
    const matches = [...this.mailbox.values()].filter(
      (message) =>
        (options.labelIds ?? []).every((label) => message.labelIds.includes(label)) &&
        (options.includeSpamTrash || !message.labelIds.some((label) => label === "SPAM" || label === "TRASH")) &&
        message.sentAt.getTime() < before,
    );
    const pageSize = Math.min(options.maxResults ?? 100, 500);
    const start = Number(options.pageToken ?? 0);
    const page = matches.slice(start, start + pageSize);
    const next = start + pageSize;
    return {
      // Gmail leaves the field out when nothing matches.
      ...(page.length > 0 && { messages: page.map((message) => ({ id: message.id, threadId: message.id })) }),
      ...(next < matches.length && { nextPageToken: String(next) }),
      resultSizeEstimate: matches.length,
    };
  }

  private batchDelete(resource: { ids: string[] }, userId: string) {
    expect(userId).toBe("me");
    // Gmail's batch endpoints take at most 1,000 ids a request.
    expect(resource.ids.length).toBeLessThanOrEqual(1000);
    for (const id of resource.ids) this.mailbox.delete(id);
  }
}

/** The search query's `before:` cutoff in Unix seconds, the one operator the purge may use. */
function parseBefore(query = ""): number {
  const terms = query.split(/\s+/).filter(Boolean);
  const before = terms.map((term) => /^before:(\d+)$/.exec(term)?.[1]).find(Boolean);
  expect(terms).toHaveLength(before ? 1 : 0);
  return before ? Number(before) * 1000 : Infinity;
}

interface FakeTrigger {
  handler: string;
  everyDays?: number;
  atHour?: number;
  getHandlerFunction(): string;
}

class FakeScriptApp {
  triggers: FakeTrigger[] = [];

  constructor(existing: { handler: string; everyDays: number }[]) {
    for (const { handler, everyDays } of existing) this.newTrigger(handler).timeBased().everyDays(everyDays).create();
  }

  getProjectTriggers() {
    return [...this.triggers];
  }

  deleteTrigger(trigger: FakeTrigger) {
    this.triggers = this.triggers.filter((existing) => existing !== trigger);
  }

  newTrigger(handler: string) {
    const trigger: FakeTrigger = { handler, getHandlerFunction: () => handler };
    const builder = {
      timeBased: () => builder,
      everyDays: (days: number) => ((trigger.everyDays = days), builder),
      atHour: (hour: number) => ((trigger.atHour = hour), builder),
      create: () => (this.triggers.push(trigger), trigger),
    };
    return builder;
  }
}

function loadScript(globals: { Gmail?: FakeGmail; ScriptApp?: FakeScriptApp }) {
  const logs: string[] = [];
  const context = vm.createContext({ ...globals, console: { log: (line: string) => logs.push(line) } });
  vm.runInContext(SOURCE, context);
  return { script: context as { purgeSentMail(): void; installTrigger(): void }, logs };
}

function messageHoursAgo(id: string, hours: number, labelIds = ["SENT"]): MailboxMessage {
  return { id, labelIds, sentAt: new Date(Date.now() - hours * HOUR_MS) };
}

describe("the sent mail purge", () => {
  it("permanently deletes sent mail older than a day, including Trash, and keeps everything else", () => {
    const gmail = new FakeGmail([
      messageHoursAgo("old-verification", 25),
      messageHoursAgo("old-reset-in-trash", 72, ["SENT", "TRASH"]),
      messageHoursAgo("old-demo-reset", 48, ["SENT", "INBOX", "UNREAD"]),
      messageHoursAgo("recent-verification", 23),
      messageHoursAgo("old-privacy-request", 120, ["INBOX"]),
    ]);
    const { script, logs } = loadScript({ Gmail: gmail });

    script.purgeSentMail();

    expect([...gmail.mailbox.keys()]).toEqual(["recent-verification", "old-privacy-request"]);
    expect(logs).toEqual(["Deleted 3 sent messages older than 24 hours."]);
  });

  it("deletes every match when there's more than one page of it", () => {
    const old = Array.from({ length: 1234 }, (_, index) => messageHoursAgo(`old-${index}`, 30));
    const gmail = new FakeGmail([...old, messageHoursAgo("recent", 1)]);
    const { script } = loadScript({ Gmail: gmail });

    script.purgeSentMail();

    expect([...gmail.mailbox.keys()]).toEqual(["recent"]);
  });

  it("does nothing when no sent mail is old enough", () => {
    const gmail = new FakeGmail([messageHoursAgo("recent", 2)]);
    const { script, logs } = loadScript({ Gmail: gmail });

    script.purgeSentMail();

    expect([...gmail.mailbox.keys()]).toEqual(["recent"]);
    expect(logs).toEqual(["Deleted 0 sent messages older than 24 hours."]);
  });
});

describe("installing the purge trigger", () => {
  it("leaves exactly one purge trigger, daily at 03:00 UTC, however often it runs, and keeps other triggers", () => {
    const scriptApp = new FakeScriptApp([
      { handler: "purgeSentMail", everyDays: 7 },
      { handler: "somethingElse", everyDays: 7 },
    ]);
    const { script } = loadScript({ ScriptApp: scriptApp });

    script.installTrigger();
    script.installTrigger();

    expect(scriptApp.triggers.map(({ handler, everyDays, atHour }) => ({ handler, everyDays, atHour }))).toEqual([
      { handler: "somethingElse", everyDays: 7 },
      { handler: "purgeSentMail", everyDays: 1, atHour: 3 },
    ]);
  });
});
