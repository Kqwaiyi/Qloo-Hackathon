// Permanently deletes the team Gmail's sent mail once it's more than a day old. Every email the app
// sends over SMTP leaves a copy in Sent, holding the user's address and a token link, and the
// Privacy Policy says those copies are purged daily. It deletes everything in Sent, so the team's
// own replies from Gmail go too.
//
// This runs in an Apps Script project owned by the team Gmail account, not in the app. The last
// stage of scripts/setup-team-gmail.sh pastes this file and appsscript.json into that project and
// runs installTrigger once.

const MAX_AGE_HOURS = 24;
// Gmail's list returns at most 500 messages a page.
const LIST_PAGE_SIZE = 500;
// batchDelete states no limit, but its sibling batchModify takes at most 1,000 ids, so stay under.
const DELETE_BATCH_SIZE = 500;

/** Run daily by the trigger: deletes every sent message older than MAX_AGE_HOURS, Trash included. */
function purgeSentMail() {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);
  // Lists everything first: deleting while paging would shift the pages and skip messages.
  const ids = listSentMessageIdsBefore(cutoff);
  for (let start = 0; start < ids.length; start += DELETE_BATCH_SIZE) {
    // Permanent, unlike moving to Trash. It needs the full-mail scope in appsscript.json.
    Gmail.Users.Messages.batchDelete({ ids: ids.slice(start, start + DELETE_BATCH_SIZE) }, "me");
  }
  console.log(`Deleted ${ids.length} sent messages older than ${MAX_AGE_HOURS} hours.`);
}

/** Run once from the editor: replaces any purge trigger with one that runs every day around 03:00 UTC. */
function installTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === "purgeSentMail") ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger("purgeSentMail").timeBased().everyDays(1).atHour(3).create();
}

function listSentMessageIdsBefore(cutoff) {
  const options = {
    labelIds: ["SENT"],
    // Unix seconds, since a plain date would mean midnight Pacific time.
    q: `before:${Math.floor(cutoff.getTime() / 1000)}`,
    includeSpamTrash: true,
    maxResults: LIST_PAGE_SIZE,
  };
  const ids = [];
  let pageToken;
  do {
    const page = Gmail.Users.Messages.list("me", pageToken ? { ...options, pageToken } : options);
    for (const message of page.messages || []) ids.push(message.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}
