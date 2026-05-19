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

const deleteMessage = async (unixTimestamp) => {
  const deleteForm = new FormData();
  deleteForm.append("token", TOKEN);
  deleteForm.append("channel", CHANNEL);
  deleteForm.append("ts", unixTimestamp);

  const res = await fetch("https://" + WORKSPACE + "/api/chat.delete", {
    headers: {
      accept: "*/*",
      "cache-control": "no-cache",
      pragma: "no-cache",
      cookie: COOKIE,
    },
    referrerPolicy: "no-referrer",
    body: deleteForm,
    method: "POST",
  });

  return {
    result: await res.json(),
    headers: res.headers,
  };
};

const main = async () => {
  const historyFetchForm = new FormData();
  historyFetchForm.append("token", TOKEN);
  historyFetchForm.append("channel", CHANNEL);
  historyFetchForm.append("limit", MESSAGE_COUNT + "");
  historyFetchForm.append("oldest", OLDEST_UNIX_TIMESTAMP);

  let hasMore = true;
  let cursor;

  while (hasMore) {
    if (cursor) {
      historyFetchForm.set("cursor", cursor);
    }

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
        body: historyFetchForm,
        method: "POST",
      },
    );

    const json = await data.json();

    hasMore = json.has_more;
    cursor = json.response_metadata?.next_cursor;

    const userMessages = json.messages.filter(
      (message) => message.user === USER,
    );

    for (const message of userMessages) {
      await delay(500);

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
  }
};

await main();
