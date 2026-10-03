# TradingView Public Chat Terminal

A local-first, high-reliability web terminal designed for viewing, archiving, and participating in TradingView public and private chat channels. The application operates locally on the operator's infrastructure, strictly isolates credentials from version control, and leverages authenticated TradingView sessions for secure data retrieval.

> **Legal Disclaimer & Non-Affiliation:** This independent, community-maintained software is **not an official TradingView product**. It is not affiliated with, endorsed by, sponsored by, or supported by TradingView Inc. "TradingView" and all associated trademarks belong to their respective rights holders. See [DISCLAIMER.md](DISCLAIMER.md) for full operational compliance and disclaimers.

---

## 📌 Executive Rationale & Background

TradingView has formally announced the scheduled deprecation and retirement of its **Public Chat** infrastructure, effective **September 30, 2026**.

This repository provides a resilient, standalone, local-first web terminal to mitigate operational disruption caused by the upcoming service sunset. Designed for traders, analysts, and financial technology operators, the terminal enables:
- **Continuous Access & Archival**: Retrieve, display, and locally archive public chat histories prior to and following the deprecation deadline.
- **Unified Channel Operations**: Seamlessly monitor both public rooms and private direct messages (DMs/Group channels) within a single interface.
- **Zero-Trust Data Sovereignty**: Retain complete local ownership of message logs, cache, and user session metadata without third-party server exposure.

---

## ✨ System Architecture & Feature Matrix

The terminal delivers a comprehensive suite of features engineered for continuous market monitoring and real-time community engagement:

### 🔔 1. Event Telemetry & Multi-Tier Notifications
- **Real-Time Notification Toasts**: Non-intrusive floating alert overlays positioned top-center for incoming messages across background channels.
- **Channel Unread Badges**: Dynamic visual indicator badges rendering real-time unread message counts per room.
- **Dedicated Mention & Reply Drawer**: Centralized **"Mention & Reply"** modal aggregating all historical handle mentions (`@username`) and quote-replies.
- **Acoustic Alert Subsystems**: Dedicated audio chimes (`/sounds/mention.mp3` for targeted mentions/replies; `/sounds/feed.mp3` for general channel activity).
- **Dynamic Browser State Counter**: Automatic tab title updates (e.g., `(3) Public Chat Viewer`) tracking pending unread notifications.

### 🔍 2. Message Filtering, Parsing & Search Engine
- **Scoped Viewing Modes**: Instant toggle between **"All chat"** feed and **"My messages & mentions"** for focused conversation tracking.
- **In-Memory Keyword & Handle Search**: High-performance real-time search filtering message logs by sender handle or text content.
- **Paginated Log Retrieval & Storage Auditing**: On-demand pagination ("Load older") with live cache size monitoring and instant one-click cache purge.

### 📸 3. Screen Capture Pipeline & Direct Snapshot Attachment
- **Native Screen Capture API**: Integrated screen and tab capture utility allowing seamless chart snapshot acquisition (**Capture chart** button).
- **Staging Review Modal**: Modal preview for review and verification prior to transmission ("Use This" / "Delete").
- **Automated TradingView CDN Upload**: Direct image payload upload to TradingView's snapshot endpoints with automatic Markdown attachment formatting.

### 😎 4. Native Shortcode Parsing & Emoji Picker
- **TradingView Emoji Palette**: Integrated popover interface featuring TradingView-compatible emoji definitions (`:shades:`, `:rocket:`, `:fire:`, `:chart:`).
- **Inline Rendering Engine**: Automatic shortcode parsing converting raw text tokens into inline visual glyphs.

### 💬 5. Quote Threading & Interactive Mentions
- **Dynamic `@` Handle Autocomplete**: Context-aware user suggestion dropdown triggered upon typing `@` within the composer.
- **Editable Quote Threading**: One-click "Reply" button injecting structured `[quote=username]` tags with inline quote-editing capabilities.
- **Interactive Profile Handles**: Hyperlinked usernames and mentions enabling instant interaction and handle selection.

### 📈 6. Ticker Binding & Safe Asset Preview Proxying
- **Active Chart Symbol Attachment**: Bind specific financial tickers (e.g., `CRYPTO:BTCUSD`, `NASDAQ:AAPL`) directly to outgoing payloads.
- **Isolated Asset Link Previews**: Secure server-side proxy fetching open-graph metadata and snapshot thumbnails for TradingView chart URLs (`tradingview.com/x/...` and published scripts).

### 📂 7. Room Topology & Local Privacy Controls
- **Hierarchical Channel Navigation**: Organized channel hierarchy categorizing **Favorites (Starred)**, **Public Channels**, and **Private Inbox (DMs/Group PMs)**.
- **Responsive & Resizable Workspace**: Drag-to-resize panel layout with collapsible category headers.
- **Zero-Trust Client Isolation**: All preferences, bookmarks, notification indexes, and unread states are stored exclusively in the browser's `localStorage`. No telemetry or credentials are exposed to external third-party servers.

---

## 🔑 Authentication Architecture

The application supports two distinct authentication pathways within `.env`.

### 🌟 Primary Recommended Protocol: Method B (Manual Browser Session)
> **Operational Guidance:**  
> Automatic credential sign-in (Method A) frequently encounters automated friction controls (CAPTCHA challenges or Multi-Factor Authentication / 2FA). **Authentication Method B (Manual Browser Session)** is the **primary recommended protocol**, as it extracts validated session tokens from an authenticated browser session, bypassing CAPTCHA and 2FA hurdles entirely.

---

### 📖 Step-by-Step Session Cookie Extraction Guide (Browser Developer Tools)

*A clear, non-technical operational guide for extracting authenticated session tokens across modern web browsers:*

#### Step 1: Authenticate in TradingView
1. Open your primary web browser (Google Chrome, Brave, Microsoft Edge, Mozilla Firefox, or Apple Safari).
2. Navigate to `https://www.tradingview.com` and ensure you are signed into your active TradingView account.

#### Step 2: Open Browser Developer Tools
- **Windows / Linux**: Press `F12` or `Ctrl + Shift + I`.
- **macOS**: Press `Cmd + Option + I` or `F12`.

#### Step 3: Extract Required Session Tokens
- **Google Chrome / Microsoft Edge / Brave**:
  1. Select the **Application** tab in the top navigation bar of Developer Tools (click `>>` if hidden).
  2. In the left panel, expand **Storage** > **Cookies** > select `https://www.tradingview.com`.
- **Mozilla Firefox**:
  1. Select the **Storage** tab.
  2. Expand **Cookies** > select `https://www.tradingview.com`.
- **Apple Safari**:
  1. Select the **Storage** tab > **Cookies** > `www.tradingview.com`.

Locate the following three cookie keys and copy their exact **Value** strings:
1. `sessionid` ➡️ Copy value into `TV_SESSIONID`
2. `sessionid_sign` ➡️ Copy value into `TV_SESSIONID_SIGN`
3. `device_t` ➡️ Copy value into `TV_DEVICE_T`

#### Step 4: Obtain Your Public TradingView Handle
1. Retrieve your public TradingView username (visible on your user profile or profile URL: `https://www.tradingview.com/u/YOUR_USERNAME/`).
2. Copy `YOUR_USERNAME` into `TV_CHAT_USERNAME`.

#### Step 5: Configure `.env` Environment File
Open `.env` in the project root directory and populate the variables accordingly:

```dotenv
TV_SESSIONID=your_sessionid_cookie_value
TV_SESSIONID_SIGN=your_sessionid_sign_cookie_value
TV_DEVICE_T=your_device_t_cookie_value
TV_CHAT_USERNAME=your_public_tradingview_handle
```

*(Note: Session tokens expire periodically. If your session terminates, re-extract fresh tokens using the steps above, update `.env`, remove `session.json`, and restart the server with `npm start`).*

---

### Alternative Protocol: Method A (Automatic Sign-in)

When automated security challenges (CAPTCHA / 2FA) are not active on the target account, direct credential submission may be configured:

```dotenv
TV_USERNAME=your_handle_or_email
TV_PASSWORD=your_password
TV_CHAT_USERNAME=your_public_handle
```

---

## 🚀 Prerequisites & System Requirements

Before deploying the application, ensure the following environmental prerequisites are met:
- **Node.js**: Version 18.0.0 or later (Node.js 20 LTS recommended).
- **Package Manager**: `npm` (packaged with Node.js).
- **TradingView Account**: An active TradingView account with permission to access target channels.
- **Web Browser**: A modern browser (Chromium-based, Firefox, or Safari).

---

## 💻 Installation & Deployment Guide

1. **Clone Repository**:
   ```bash
   git clone https://github.com/<your-account>/tradingview-public-chat-terminal.git
   cd tradingview-public-chat-terminal
   ```

2. **Install Dependencies**:
   ```bash
   npm ci
   ```

3. **Initialize Environment Configuration**:
   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

4. **Populate `.env`** with **Method B** session values as specified in the extraction guide above.

5. **Launch Application Server**:
   ```bash
   npm start
   ```

6. **Access Local Terminal**:
   Open `http://127.0.0.1:3344` in your browser.

---

## 🛠️ System Configuration & Operational Parameters

- **Port Assignment**: `PORT` defaults to `3344`. Modify `PORT` in `.env` if local port conflicts arise.
- **Public Channel Configuration (`rooms.js`)**: Public chat room definitions reside in `rooms.js`. Customize room IDs as required.
- **Private Inbox Discovery**: Private direct messages and group conversations are dynamically enumerated upon successful authentication.

---

## 🔒 Security Model & Control Posture

- **Loopback Binding**: The application server binds exclusively to `127.0.0.1` (loopback interface) by default, restricting access strictly to the local host operator.
- **Credential Protection**: Environment files (`.env`, `.env.*`) and persistent session stores (`session.json`) are excluded from Git version control via `.gitignore`.
- **SSRF Prevention**: Outbound preview proxies strictly enforce HTTPS scheme validation restricted to `*.tradingview.com` domains.

---

## ❓ Operational Troubleshooting

| Symptom | Root Cause & Remediation |
| --- | --- |
| `The .env file is incomplete` | Mandatory variables are missing. Verify that all Method B (or Method A) parameters are fully configured in `.env`. |
| CAPTCHA or 2FA Error on Startup | Automatic authentication was blocked by TradingView security controls. Transition to **Method B (Manual Session Protocol)**. |
| `session expired` Error | Session cookies have expired. Extract fresh tokens from browser DevTools, update `.env`, delete `session.json`, and restart via `npm start`. |
| Port Binding Failure (`EADDRINUSE`) | Designated port is occupied. Assign a custom port (e.g., `PORT=3345`) in `.env` and restart. |
| Private Channels Unavailable | Verify that the target account contains active DMs and that session tokens remain valid. |

---

## 📁 Repository Structure

```text
.
├── public/
│   ├── index.html       # Single-page terminal UI (HTML5/CSS3/Vanilla JS)
│   └── sounds/          # Audio telemetry assets (mention.mp3, feed.mp3)
├── auth.js              # Session acquisition, cookie parsing & state persistence
├── rooms.js             # Public channel configuration registry
├── server.js            # Express API proxy and security middleware
├── .env.example         # Production configuration template
├── docs/                # Technical and architectural documentation
└── DISCLAIMER.md        # Operational and legal compliance notice
```

---

## 📜 License

Distributed under the terms of the [MIT License](LICENSE).
