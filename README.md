# Slack Message Deleter

Bulk delete your own messages from a Slack channel. Uses Slack's public Web API — no workspace app installation required.

Features:
- Paginates through all channel history
- Deletes your messages inside threads
- Handles rate limiting automatically

## Setup

**1. Copy the config template:**

```sh
cp config.json.example config.json
```

**2. Fill in `config.json`:**

| Field | Description | Example |
|---|---|---|
| `workspace` | Your Slack workspace hostname | `acme.slack.com` |
| `targetChannelId` | Channel to delete from | `C1234567890` (channel) or `D012345678` (DM) |
| `currentUserId` | Your Slack user ID | `U012345678` |
| `token` | Your session token | `xoxc-...` |
| `cookie` | Your session cookie | (full `Cookie` header value) |

## Finding your credentials

**User ID** — Click your profile picture → **Profile** → kebab menu next to **View as** → **Copy member ID**.

**Token** — Open Slack in a browser, open DevTools → Network tab, filter for `info`, and copy the `token` field from the request body.

**Cookie** — From the same DevTools Network tab, copy the entire value of the `Cookie` request header from any Slack API request.

## Run

```sh
npm run start
```

Requires Node.js 24 (see `.nvmrc`). No dependencies to install.

## Notes

- This script only deletes your own messages by design. In 1:1 DMs, the API also enforces this — even admins cannot delete the other person's messages.
- To start deletion from a specific point in time, edit `OLDEST_UNIX_TIMESTAMP` in `main.js`.
