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
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        pragma: "no-cache",
        cookie: COOKIE,
      },
      referrerPolicy: "no-referrer",
      body: form,
      method: "POST",
    },
  );

  return await res.json();
};

const deleteMessage = async (unixTimestamp) => {
  const form = new FormData();
  form.append("token", TOKEN);
  form.append("channel", CHANNEL);
  form.append("ts", unixTimestamp);

  const res = await fetch("https://" + WORKSPACE + "/api/chat.delete", {
    headers: {
      accept: "*/*",
      "cache-control": "no-cache",
      pragma: "no-cache",
      cookie: COOKIE,
    },
    referrerPolicy: "no-referrer",
    body: form,
    method: "POST",
  });

  return {
    result: await res.json(),
    headers: res.headers,
  };
};

const deleteMessages = async (messages, insideThread) => {
  for (const message of messages) {
    await delay(500);

    if (message.thread_ts && !insideThread) {
      console.log("Fetching thread messages...");
      const thread = await getThread(message.thread_ts);
      const userThreadMessages = thread.messages.filter(
        (message) => message.user === USER,
      );
      console.log("Deleting thread messages...");
      await deleteMessages(userThreadMessages, true);
      continue;
    }

    const unixTimestamp = message.ts;
    const { result, headers } = await deleteMessage(unixTimestamp);

    if (result.error === RATELIMITED_ERROR) {
      const retryAfterInMs = Number(headers.get("retry-after")) * 1000;
      console.log(retryAfterInMs);
      console.log(`ratelimited, retrying after ${retryAfterInMs}ms`);
      await delay(retryAfterInMs);

      await deleteMessage(unixTimestamp);
    }
  }
};

const main = async () => {
  const form = new FormData();
  form.append("token", TOKEN);
  form.append("channel", CHANNEL);
  form.append("limit", MESSAGE_COUNT + "");
  form.append("oldest", OLDEST_UNIX_TIMESTAMP);

  let hasMore = true;
  let cursor;

  while (hasMore) {
    if (cursor) {
      form.set("cursor", cursor);
    }

    console.log("Fetching messages...");

    // https://docs.slack.dev/reference/methods/conversations.history/
    const data = await fetch(
      "https://" + WORKSPACE + "/api/conversations.history",
      {
        headers: {
          accept: "*/*",
          "cache-control": "no-cache",
          pragma: "no-cache",
          cookie: COOKIE,
        },
        referrerPolicy: "no-referrer",
        body: form,
        method: "POST",
      },
    );

    const json = await data.json();

    hasMore = json.has_more;
    cursor = json.response_metadata?.next_cursor;

    if (!hasMore) {
      console.log("Last page...");
    }

    // Filter for messages sent by the user, and threads created by anybody
    const userMessagesAndThreads = json.messages.filter(
      (message) => message.user === USER || !!message.thread_ts,
    );

    console.log(`Deleting ${userMessagesAndThreads.length} message(s)...`);

    await deleteMessages(userMessagesAndThreads, false);
  }
};

await main();
