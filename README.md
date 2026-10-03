# TradingView Public Chat Terminal

A local-first web terminal for viewing and participating in selected TradingView public and private chat rooms. The application runs only on the operator's computer, keeps credentials outside source control, and uses the operator's authenticated TradingView session to retrieve chat data.

> **Important:** This is an independent, unofficial project. It is not affiliated with, endorsed by, or supported by TradingView. TradingView endpoints used by this application may change or become unavailable at any time. Use the software only in accordance with TradingView's terms, applicable law, and your organisation's policies.

## Contents

- [Capabilities](#capabilities)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Operation](#operation)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Development](#development)

## Capabilities

- Loads configured public rooms and the authenticated user's private-chat inbox.
- Polls the active room for new messages and maintains unread indicators for background rooms.
- Sends plain messages, replies, mentions, tickers, and TradingView chart snapshots.
- Supports message history, room-local search, saved room favourites, link previews, and browser-local notification records.
- Uses either automatic sign-in credentials or a manually supplied browser session.

The terminal is designed for an individual operator on `localhost`; it is not a multi-user service and must not be exposed to a public network.

## Architecture

The browser interface is served by a small Express application. The backend owns all TradingView credentials and session cookies, calls TradingView endpoints, and exposes a narrow local API to the browser. The browser never receives the configured password or session-cookie values.

```text
Browser (localhost) <-> Express backend <-> TradingView
                         |                 |
                      .env / session.json  authenticated endpoints
```

Session state is stored in `session.json`, which is intentionally excluded from Git. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for endpoint and data-flow details.

## Prerequisites

- Node.js 18 or later (Node.js 20 LTS is recommended).
- npm, supplied with Node.js.
- A TradingView account permitted to access the rooms you intend to use.
- A modern browser.

## Installation

1. Clone the repository and enter the project directory.

   ```bash
   git clone https://github.com/<your-account>/tradingview-public-chat-terminal.git
   cd tradingview-public-chat-terminal
   ```

2. Install locked dependency versions.

   ```bash
   npm ci
   ```

3. Create a private configuration file.

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

4. Configure one authentication method in `.env`, as described below.

5. Start the terminal.

   ```bash
   npm start
   ```

6. Open `http://127.0.0.1:3344` in the same computer's browser.

## Configuration

Copy `.env.example` to `.env`; never commit, upload, screen-share, or paste `.env` or `session.json` into an issue. Both can grant access to the associated TradingView account.

### Authentication method A: automatic sign-in

Set `TV_USERNAME` and `TV_PASSWORD`. The backend signs in when it has no valid saved session. This flow may be blocked by CAPTCHA or two-factor authentication.

```dotenv
TV_USERNAME=your_handle_or_email
TV_PASSWORD=your_password
TV_CHAT_USERNAME=your_public_handle
```

`TV_CHAT_USERNAME` is optional, but recommended when `TV_USERNAME` is an email address; it improves mention and reply matching.

### Authentication method B: manual browser session

If automatic sign-in is unavailable, authenticate normally in your browser and provide the session values required by the application:

```dotenv
TV_SESSIONID=replace_with_your_value
TV_SESSIONID_SIGN=replace_with_your_value
TV_DEVICE_T=replace_with_your_value
TV_CHAT_USERNAME=your_public_handle
```

Manual session values expire. Replace them using a newly authenticated browser session and remove `session.json` before restarting the server. Never attempt to bypass a CAPTCHA or 2FA challenge; complete those controls in the official TradingView browser experience.

### Other options

`PORT` defaults to `3344`. Set it only when another local process already occupies that port.

Room definitions reside in `rooms.js`. Add only public room identifiers that you are authorised to access. Private rooms are discovered from the authenticated account and must not be hard-coded.

## Operation

After startup, select a room in the sidebar. The active room refreshes every five seconds, while background rooms refresh at a conservative interval for unread badges. Use the message field to compose a message; quote replies and `@` mentions are formatted using TradingView-compatible text. The **Capture** action asks the browser to select a tab or window, then uploads the confirmed PNG as a TradingView snapshot.

The application persists UI preferences, limited message history, and notification records in the browser's local storage. Clear the site data in your browser to remove that local state.

## Security model

- The server binds to loopback by default and is intended for a single trusted operator.
- `.env`, `.env.*`, and `session.json` are ignored by Git. `.env.example` contains placeholders only.
- The preview endpoint accepts HTTPS TradingView URLs only, preventing it from acting as an arbitrary outbound proxy.
- Snapshot payloads and ticker values are size- and format-validated.
- Do not deploy this project to a shared host, a public IP address, or a reverse proxy without a formal security review.

Read [SECURITY.md](SECURITY.md) before deployment or contribution. If a credential was ever committed or shared, revoke or rotate it immediately; removing it from a later commit does not make it safe.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `The .env file is incomplete` | Configure either the username/password pair or all three manual session values. |
| CAPTCHA or 2FA blocks sign-in | Sign in through the official browser flow and use a fresh manual session; do not automate the challenge. |
| `session expired` | Refresh the browser session values or supply valid credentials, delete `session.json`, then restart. |
| Port is already in use | Set an unused local `PORT` in `.env` and restart. |
| No private rooms appear | Confirm that the account has private chats and that the saved session is valid. |

## Project structure

```text
.
├── public/index.html       Browser client
├── auth.js                 Session acquisition and persistence
├── rooms.js                Curated public-room configuration
├── server.js               Local Express API and TradingView proxy
├── .env.example            Safe configuration template
├── docs/                   Operational and architecture documentation
└── SECURITY.md             Security and vulnerability-reporting policy
```

## Development

Run syntax validation before committing:

```bash
npm test
```

The project intentionally has no test framework or build step. Changes should be validated with the syntax check and a manual localhost session using non-production credentials. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the [MIT License](LICENSE).
