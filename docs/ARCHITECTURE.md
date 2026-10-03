# Architecture

## Components

| Component | Responsibility |
| --- | --- |
| `public/index.html` | Renders the local UI, manages browser-local state, and calls the local API. |
| `server.js` | Serves static files, validates local requests, proxies approved TradingView operations, and refreshes sessions when possible. |
| `auth.js` | Creates, restores, serialises, and validates the TradingView session-cookie jar. |
| `rooms.js` | Defines the public rooms displayed by default. |

## Data flow

1. Startup loads environment values and restores `session.json` when it contains a valid session.
2. When no reusable session exists, the backend uses manual session values or attempts automatic sign-in.
3. The browser calls only the local API. The backend attaches the session cookie to approved TradingView requests.
4. The browser stores UI-only data in local storage. Credentials remain server-side.

## Local API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/config` | GET | Supplies the public chat handle for UI matching. |
| `/api/rooms` | GET | Returns configured public rooms and discovered private rooms. |
| `/api/messages/:roomId` | GET | Returns a validated room's messages. |
| `/api/notifications` | GET | Retrieves account chat notifications. |
| `/api/link-preview` | GET | Retrieves metadata only for HTTPS TradingView URLs. |
| `/api/snapshot` | POST | Validates a PNG capture and creates a TradingView snapshot. |
| `/api/send` | POST | Validates and sends a message to a known room. |

## Operational constraints

TradingView endpoints used by this client are not a public, stable API contract. They may require an authenticated browser-compatible session, return different payload shapes, impose rate limits, or stop working without notice. Treat all upstream access as best-effort and avoid aggressive polling.
