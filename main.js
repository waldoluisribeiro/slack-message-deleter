import { strict as assert } from "node:assert";
import config from "./config.json" with { type: "json" };

const MESSAGE_COUNT = 999;
const RATELIMITED_ERROR = "ratelimited";
const OLDEST_UNIX_TIMESTAMP = "0"; // Use this to start fetching from a specific message onwards

const WORKSPACE = config.workspace;
const CHANNEL = config.targetChannelId;
const USER = config.currentUserId;
const TOKEN = config.token;
const COOKIE = config.cookie;

assert(WORKSPACE, "Please config your workspace information in config.json!");
assert(CHANNEL, "Please config your workspace information in config.json!");
assert(USER, "Please config your workspace information in config.json!");
assert(TOKEN, "Please config your workspace information in config.json!");
assert(COOKIE, "Please config your workspace information in config.json!");

const delay = async function (time) {
  return new Promise((resolve, _) => {
    setTimeout(resolve, time);
  });
};

const getHeaders = () => ({
  accept: "*/*",
  "cache-control": "no-cache",
  pragma: "no-cache",
  cookie: COOKIE,
});

// https://docs.slack.dev/reference/methods/conversations.history/
const getMessagesAndThreads = async (cursor) => {
  const form = new FormData();
  form.append("token", TOKEN);
  form.append("channel", CHANNEL);
  form.append("limit", MESSAGE_COUNT + "");
  form.append("oldest", OLDEST_UNIX_TIMESTAMP);
  if (cursor) {
    form.set("cursor", cursor);
  }

  const data = await fetch(
    "https://" + WORKSPACE + "/api/conversations.history",
    {
      headers: getHeaders(),
      referrerPolicy: "no-referrer",
      body: form,
      method: "POST",
    },
  );

  const json = await data.json();

  return {
    messages: json.messages,
    hasMore: json.has_more,
    nextCursor: json.response_metadata?.next_cursor,
  };
};

// https://docs.slack.dev/reference/methods/conversations.replies/
const getThread = async (unixTimestamp) => {
  const form = new FormData();
  form.append("token", TOKEN);
  form.append("channel", CHANNEL);
  form.append("limit", MESSAGE_COUNT + "");
  form.append("oldest", OLDEST_UNIX_TIMESTAMP);
  form.append("ts", unixTimestamp);

  const res = await fetch(
    "https://" + WORKSPACE + "/api/conversations.replies",
    {
      headers: getHeaders(),
      referrerPolicy: "no-referrer",
      body: form,
      method: "POST",
    },
  );

  return await res.json();
};

// https://docs.slack.dev/reference/methods/chat.delete/
const deleteMessage = async (unixTimestamp) => {
  console.log(`Deleting message ${unixTimestamp}...`);

  const form = new FormData();
  form.append("token", TOKEN);
  form.append("channel", CHANNEL);
  form.append("ts", unixTimestamp);

  const res = await fetch("https://" + WORKSPACE + "/api/chat.delete", {
    headers: getHeaders(),
    referrerPolicy: "no-referrer",
    body: form,
    method: "POST",
  });

  return {
    result: await res.json(),
    headers: res.headers,
  };
};

const deleteMessagesAndThreads = async (messages, insideThread) => {
  for (const message of messages) {
    // Slow down to minimise rate limit hits
    await delay(500);

    // Messages in threads also have the `thread_ts` property,
    // but since threads have a maximum depth of one,
    // once we're inside a thread, it's safe to assume that's as far as we can go
    if (message.thread_ts && !insideThread) {
      console.log("Fetching thread messages...");
      const thread = await getThread(message.thread_ts);
      // Here we only filter for messages sent by the user;
      // there are no threads to be found inside threads
      const userThreadMessages = thread.messages.filter(
        (message) => message.user === USER,
      );
      console.log("Deleting thread messages...");
      await deleteMessagesAndThreads(userThreadMessages, true);
      continue;
    }

    const unixTimestamp = message.ts;
    const { result, headers } = await deleteMessage(unixTimestamp);

    if (result.error === RATELIMITED_ERROR) {
      const retryAfterInMs = Number(headers.get("retry-after")) * 1000;
      console.log(
        `ratelimited, retrying after ${new Intl.NumberFormat("en-GB").format(retryAfterInMs)}ms`,
      );
      await delay(retryAfterInMs);

      await deleteMessage(unixTimestamp);
    }
  }
};

const main = async () => {
  // Keep track of whether there are more pages of messages/threads and the pagination cursor
  let hasMore = true;
  let cursor;

  while (hasMore) {
    console.log("Fetching messages and threads...");

    const {
      messages,
      hasMore: stillHasMore,
      nextCursor,
    } = await getMessagesAndThreads(cursor);

    if (!Array.isArray(messages)) {
      console.error("Something went wrong.");
      process.exit(1);
    }

    hasMore = stillHasMore;
    cursor = nextCursor;

    if (!hasMore) {
      console.log("Last page...");
    }

    // Filter for messages sent by the user, and threads created by anybody,
    // since any thread may contain messages sent by the user
    const userMessagesAndThreads = messages.filter(
      (message) => message.user === USER || !!message.thread_ts,
    );

    console.log(
      `Deleting ${userMessagesAndThreads.length} message(s) and/or thread(s)...`,
    );

    await deleteMessagesAndThreads(userMessagesAndThreads, false);
  }

  console.log("Done.");
  process.exit(0);
};

await main();
