require("dotenv").config();
const express = require("express");
const rooms = require("./rooms");
const auth = require("./auth");

// Private rooms must not be hard-coded. TradingView loads the inbox through
// /chats/get/?limit=150; this cache prevents repeated metadata requests.
let privateRooms = [];
let privateRoomsAt = 0;

const PORT = process.env.PORT || 3344;
const { TV_USERNAME, TV_CHAT_USERNAME, TV_PASSWORD, TV_SESSIONID, TV_SESSIONID_SIGN, TV_DEVICE_T } = process.env;

const hasManualCookies = TV_SESSIONID && TV_SESSIONID_SIGN && TV_DEVICE_T;
const hasUsernamePassword = TV_USERNAME && TV_PASSWORD;

if (!hasManualCookies && !hasUsernamePassword) {
  console.error(
    "\n[tv-chat-viewer] The .env file is incomplete.\n" +
      "Provide either TV_USERNAME + TV_PASSWORD (automatic sign-in),\n" +
      "or TV_SESSIONID + TV_SESSIONID_SIGN + TV_DEVICE_T (manual cookies).\n" +
      "See the README section on CAPTCHA during automatic sign-in.\n"
  );
  process.exit(1);
}

let cookieJar = null; // Set during startup and renewed sign-in.

// Renew an expired session. Manual cookies without username/password cannot be
// renewed automatically, so the operator must obtain fresh browser cookies.
async function relogin() {
  if (hasUsernamePassword) {
    return auth.login(TV_USERNAME, TV_PASSWORD);
  }
  const err = new Error(
    "The session (manual cookies) has expired and no username/password is available for automatic sign-in. " +
      "Get fresh cookies from your browser (see README), update .env, delete session.json, then run npm start again."
  );
  err.code = "SESSION_EXPIRED";
  throw err;
}

function baseHeaders() {
  return {
    Accept: "*/*",
    "X-Requested-With": "XMLHttpRequest",
    "X-Language": "en",
    Referer: "https://www.tradingview.com/api/jsapi/chat-n-watchlist?mobileapp=true",
    "User-Agent": auth.COMMON_HEADERS["User-Agent"],
    Cookie: auth.cookieJarToHeader(cookieJar),
  };
}

// A small in-memory cache prevents simultaneous browser tabs from placing
// unnecessary polling load on TradingView.
const cache = new Map(); // room_id -> { data, ts }
const CACHE_MS = 3000;
const linkPreviewCache = new Map(); // URL -> { data, ts }
const LINK_PREVIEW_CACHE_MS = 15 * 60_000;

function isTradingViewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "tradingview.com" || url.hostname.endsWith(".tradingview.com"));
  } catch (_) { return false; }
}

function htmlEntityDecode(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function pageMeta(html, name) {
  // TradingView meta attributes are not always ordered. The parser therefore
  // accepts multiple tag forms so chart and /x/ pages receive an og:image.
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    tag.replace(/([\w:-]+)\s*=\s*(?:(["'])(.*?)\2|([^\s>]+))/gi, (_, key, _quote, quotedValue, bareValue) => {
      attrs[key.toLowerCase()] = htmlEntityDecode(quotedValue ?? bareValue);
      return _;
    });
    if ((attrs.property || attrs.name || "").toLowerCase() === name.toLowerCase()) return attrs.content || "";
  }
  return "";
}

async function fetchTradingViewPreview(url) {
  const cached = linkPreviewCache.get(url);
  if (cached && Date.now() - cached.ts < LINK_PREVIEW_CACHE_MS) return cached.data;
  const response = await fetch(url, {
    // Chart pages can reject requests without a session or referer even when
    // their URLs are public, so use the same session headers as chat requests.
    headers: { ...baseHeaders(), Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!response.ok || !isTradingViewUrl(response.url)) throw new Error("TradingView preview is unavailable.");
  const contentType = response.headers.get("content-type") || "";
  // A /x/ short URL can resolve directly to a PNG snapshot. Do not parse
  // binary data as HTML; return the final URL to the browser as a thumbnail.
  if (contentType.startsWith("image/")) {
    const data = { url: url, title: "TradingView chart", description: "", image: response.url };
    linkPreviewCache.set(url, { data, ts: Date.now() });
    return data;
  }
  const html = (await response.text()).slice(0, 750_000);
  const rawImage = pageMeta(html, "og:image") || pageMeta(html, "og:image:secure_url") || pageMeta(html, "twitter:image");
  // TradingView can return an OG image as a relative path. Resolve it against
  // the final URL so all eligible TradingView pages can produce thumbnails.
  let image = "";
  try { image = rawImage ? new URL(rawImage, response.url).href : ""; } catch (_) { }
  const data = {
    url: response.url,
    title: pageMeta(html, "og:title") || pageMeta(html, "twitter:title") || "TradingView",
    description: pageMeta(html, "og:description") || pageMeta(html, "description"),
    // Never load an arbitrary host declared as og:image; previews may use only
    // TradingView-owned assets.
    image: isTradingViewUrl(image) ? image : "",
  };
  linkPreviewCache.set(url, { data, ts: Date.now() });
  return data;
}

async function upstreamJson(path, { retried = false } = {}) {
  const res = await fetch(`https://www.tradingview.com${path}`, { headers: baseHeaders() });
  if ((res.status === 401 || res.status === 403) && !retried) {
    cookieJar = await relogin();
    return upstreamJson(path, { retried: true });
  }
  if (!res.ok) {
    const err = new Error(`TradingView returned status ${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "SESSION_EXPIRED" : "UPSTREAM_ERROR";
    throw err;
  }
  return res.json();
}

function privateRoomTitle(room, members, info = {}) {
  const explicit = info.title || info.name || info.chat_title || info.display_name || room.title || room.name || room.chat_title || room.display_name;
  // For a direct message, the counterpart's name is more useful than the API label.
  const memberCount = (Array.isArray(members) ? members : []).length;
  const names = (Array.isArray(members) ? members : [])
    .map((m) => m.username || m.user_name || m.name)
    .filter(Boolean)
    .filter((name) => !(TV_CHAT_USERNAME || TV_USERNAME) || name.toLowerCase() !== (TV_CHAT_USERNAME || TV_USERNAME).toLowerCase());
  if (memberCount <= 2) return names[0] || explicit || "Private chat";
  // For private groups, /chats/info/ provides the group name; members are a
  // fallback only when an older group has no name.
  if (explicit && !/^private chat$/i.test(explicit)) return explicit;
  return names.join(", ") || "Private group";
}

async function fetchPrivateRooms({ force = false } = {}) {
  if (!force && privateRoomsAt && Date.now() - privateRoomsAt < 30_000) return privateRooms;
  const payload = await upstreamJson("/chats/get/?limit=150");
  const rawRooms = Array.isArray(payload) ? payload : payload.chats || payload.rooms || payload.data || [];
  const candidates = rawRooms.filter((room) => String(room.room_id || room.id || "").startsWith("pm_"));
  privateRooms = await Promise.all(candidates.map(async (room) => {
    const roomId = room.room_id || room.id;
    let members = room.members || room.users || [];
    // /chats/get/members/ supplies counterpart names when the inbox response
    // contains only a room_id.
    if (!members.length) {
      try {
        const memberPayload = await upstreamJson(`/chats/get/members/?room_id=${encodeURIComponent(roomId)}&page=1&page_size=101`);
        members = Array.isArray(memberPayload) ? memberPayload : memberPayload.members || memberPayload.users || memberPayload.data || [];
      } catch (_) { /* Continue showing the room if metadata retrieval fails. */ }
    }
    let info = {};
    try { info = await upstreamJson(`/chats/info/?room_id=${encodeURIComponent(roomId)}`); } catch (_) { }
    const title = privateRoomTitle(room, members, info);
    let latest = null;
    if (room.last_message || room.updated) {
      const match = String(room.last_message || "").match(/^([^:]+):\s*(.*)$/s);
      const username = match ? match[1].trim() : "";
      const text = match ? match[2].trim() : String(room.last_message || "").trim();
      const time = room.updated ? new Date(Number(room.updated) * 1000).toISOString() : null;
      if (username || text || time) {
        latest = { username, text, time };
      }
    }
    return {
      room_id: roomId,
      title,
      short: title,
      is_private: true,
      unread: Number(room.unread || room.new_msgs || room.unread_count || 0),
      latest,
    };
  }));
  privateRoomsAt = Date.now();
  return privateRooms;
}

let publicRoomsCache = null;
let publicRoomsAt = 0;

async function fetchPublicRooms({ force = false } = {}) {
  if (!force && publicRoomsCache && Date.now() - publicRoomsAt < 30_000) {
    return publicRoomsCache;
  }
  try {
    const payload = await upstreamJson("/chats/public/get/");
    const tvPublicRooms = Array.isArray(payload) ? payload : payload.chats || payload.rooms || payload.data || [];
    const tvMap = new Map(tvPublicRooms.map((r) => [r.room_id, r]));
    publicRoomsCache = rooms.map((room) => {
      const tvRoom = tvMap.get(room.room_id);
      let latest = null;
      if (tvRoom && (tvRoom.msgs_last_text || tvRoom.msgs_last_ts || tvRoom.last_message)) {
        const rawText = tvRoom.msgs_last_text || tvRoom.last_message || "";
        const match = String(rawText).match(/^([^:]+):\s*(.*)$/s);
        const username = match ? match[1].trim() : "";
        const text = match ? match[2].trim() : String(rawText).trim();
        const ts = tvRoom.msgs_last_ts || tvRoom.updated;
        const time = ts ? new Date(Number(ts) * 1000).toISOString() : null;
        if (username || text || time) {
          latest = { username, text, time };
        }
      }
      return { ...room, latest };
    });
    publicRoomsAt = Date.now();
    return publicRoomsCache;
  } catch (err) {
    console.error("[tv-chat-viewer] could not fetch public room catalogue:", err.message);
    if (publicRoomsCache) return publicRoomsCache;
    return rooms;
  }
}

async function knownRoom(roomId) {
  const publicRoom = rooms.find((room) => room.room_id === roomId);
  if (publicRoom) return publicRoom;
  const privateRoom = (await fetchPrivateRooms()).find((room) => room.room_id === roomId);
  return privateRoom;
}

async function fetchRoomMessages(roomId, { isPrivate = false, offset = 0, retried = false } = {}) {
  const cacheKey = `${roomId}:${offset}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return cached.data;
  }

  // `/chats/public/get/` returns only the room catalogue, not room content.
  // Room messages are available through `conversation-status`.
  const params = new URLSearchParams({
    _rand: String(Math.random()),
    offset: String(offset),
    room_id: roomId,
    stat_interval: "D",
    stat_symbol: "",
    is_private: isPrivate ? "1" : "",
  });
  const url = `https://www.tradingview.com/conversation-status?${params}`;

  const res = await fetch(url, { headers: baseHeaders() });

  if ((res.status === 401 || res.status === 403) && !retried) {
    // The existing session may have expired: renew it once, then retry.
    console.log("[tv-chat-viewer] session expired; attempting to sign in again…");
    cookieJar = await relogin();
    return fetchRoomMessages(roomId, { isPrivate, offset, retried: true });
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error("The TradingView session is still invalid after signing in again.");
    err.code = "SESSION_EXPIRED";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`TradingView returned status ${res.status}`);
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  const json = await res.json();
  const messages = Array.isArray(json) ? json : json.messages || [];
  messages.sort((a, b) => new Date(a.time) - new Date(b.time));

  cache.set(cacheKey, { data: messages, ts: Date.now() });
  return messages;
}

const app = express();
app.use(express.static("public"));

app.get("/api/rooms", async (req, res) => {
  try {
    const [pubRooms, privRooms] = await Promise.all([fetchPublicRooms(), fetchPrivateRooms()]);
    res.json({ public: pubRooms, private: privRooms });
  } catch (err) {
    res.status(502).json({ error: err.message, code: err.code || "UPSTREAM_ERROR" });
  }
});

app.get("/api/config", (req, res) => {
  res.json({ username: TV_CHAT_USERNAME || TV_USERNAME || "" });
});

// Previews are limited to TradingView so this endpoint cannot become an
// arbitrary-URL or SSRF proxy. The browser renders the returned data.
app.get("/api/link-preview", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  if (!isTradingViewUrl(url)) return res.status(400).json({ error: "Only HTTPS TradingView URLs can be previewed." });
  try {
    res.json(await fetchTradingViewPreview(url));
  } catch (err) {
    res.status(502).json({ error: err.message || "TradingView preview could not be loaded." });
  }
});

// Native notification endpoint used by the UI for mention/reply badges and sound.
app.get("/api/notifications", async (req, res) => {
  try {
    // The chat notification view uses these subtypes. Requesting them explicitly
    // prevents a general response from filtering chat notifications.
    const subtypes = [
      "comment", "comment_pine", "mind_commented", "mind_subscribers_only_commented",
      "mention_in_ideas_comment", "mind_mentioned_in_comment", "mention_in_script_comment", "mention_in_chat",
    ].join(",");
    const notifications = await upstreamJson(`/api/v1/user/onsite_notifications/v2/?type=user&subtypes=${encodeURIComponent(subtypes)}`);
    res.json(notifications);
  } catch (err) {
    res.status(502).json({ error: err.message, code: err.code || "UPSTREAM_ERROR" });
  }
});

app.get("/api/messages/:roomId", async (req, res) => {
  const roomId = req.params.roomId;
  try {
    let known = await knownRoom(roomId);
    // A native mention can originate in a public room absent from rooms.js.
    // Allow this fallback only for safe public IDs; private rooms must remain
    // sourced from the account inbox.
    if (!known && req.query.notification_room === "1" && /^[A-Za-z0-9_-]{1,100}$/.test(roomId) && !roomId.startsWith("pm_")) {
      known = { room_id: roomId, is_private: false };
    }
    if (!known) return res.status(404).json({ error: "Unknown room." });
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 10000));
    const messages = await fetchRoomMessages(roomId, { isPrivate: Boolean(known.is_private), offset });
    res.json({ room_id: roomId, offset, messages });
  } catch (err) {
    console.error(`[tv-chat-viewer] could not load room ${roomId}:`, err.message);
    const status = err.code === "SESSION_EXPIRED" ? 401 : 502;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// Message endpoint confirmed from observed browser traffic (POST /conversation-post/).
// Field "text" membawa string apa adanya, termasuk format [quote="user"]...[/quote]
// and @mentions; TradingView does not use separate fields for either format.
async function sendMessage(roomId, text, { symbol = "", meta = { text: "" }, isPrivate = false } = {}) {
  const body = new URLSearchParams({
    meta: JSON.stringify(meta),
    room_id: roomId,
    symbol,
    text,
    is_private: isPrivate ? "1" : "",
  }).toString();

  const res = await fetch("https://www.tradingview.com/conversation-post/", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Language": "en",
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/api/jsapi/chat-n-watchlist?mobileapp=true",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": auth.COMMON_HEADERS["User-Agent"],
      Cookie: auth.cookieJarToHeader(cookieJar),
    },
    body,
  });

  if (res.status === 401 || res.status === 403) {
    console.log("[tv-chat-viewer] session expired while sending; signing in again…");
    cookieJar = await relogin();
    const retryRes = await fetch("https://www.tradingview.com/conversation-post/", {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Language": "en",
        Origin: "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/api/jsapi/chat-n-watchlist?mobileapp=true",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": auth.COMMON_HEADERS["User-Agent"],
        Cookie: auth.cookieJarToHeader(cookieJar),
      },
      body,
    });
    if (!retryRes.ok) {
      const err = new Error(`Could not send the message after signing in again (status ${retryRes.status}).`);
      err.code = "SEND_FAILED";
      throw err;
    }
    for (const key of cache.keys()) if (key.startsWith(`${roomId}:`)) cache.delete(key);
    return;
  }

  if (!res.ok) {
    const err = new Error(`TradingView rejected the message (status ${res.status}).`);
    err.code = "SEND_FAILED";
    throw err;
  }

  for (const key of cache.keys()) if (key.startsWith(`${roomId}:`)) cache.delete(key); // Ensure the next fetch is current.
}

app.use(express.json({ limit: "12mb" }));

// Desktop flow recorded on 3 October 2026:
// POST /snapshot/ (multipart: previews[]=thumb, timezone, symbol, preparedImage)
// -> the response body is the snapshot ID, which is placed in metadata for
// POST /conversation-post/. Do not replace this with direct S3 upload: it is
// signed and /snapshot/ creates the public URL.
async function createSnapshot({ png, symbol, timezone = "Asia/Jakarta" }) {
  const form = new FormData();
  form.append("previews[]", "thumb");
  form.append("timezone", timezone);
  form.append("symbol", symbol || "");
  form.append("preparedImage", new Blob([png], { type: "image/png" }), "blob");

  const res = await fetch("https://www.tradingview.com/snapshot/", {
    method: "POST",
    headers: {
      ...baseHeaders(),
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/chart/",
    },
    body: form,
  });

  if (!res.ok) {
    const err = new Error(`TradingView rejected the snapshot (status ${res.status}).`);
    err.code = "SNAPSHOT_FAILED";
    throw err;
  }
  const id = (await res.text()).trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    const err = new Error("TradingView returned an invalid snapshot ID.");
    err.code = "SNAPSHOT_FAILED";
    throw err;
  }
  return {
    url: `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`,
    preview_url: `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}_thumb.png`,
  };
}

app.post("/api/snapshot", async (req, res) => {
  const { image, symbol = "", timezone } = req.body || {};
  const match = typeof image === "string" && image.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return res.status(400).json({ error: "The capture must be a PNG.", code: "INVALID_IMAGE" });
  }
  const png = Buffer.from(match[1], "base64");
  if (!png.length || png.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: "The capture must not exceed 8 MB.", code: "IMAGE_TOO_LARGE" });
  }
  if (symbol && !/^[A-Za-z0-9_.:-]{1,80}$/.test(symbol)) {
    return res.status(400).json({ error: "Invalid ticker format.", code: "INVALID_SYMBOL" });
  }
  try {
    const snapshot = await createSnapshot({ png, symbol, timezone });
    res.json({ ok: true, snapshot });
  } catch (err) {
    console.error("[tv-chat-viewer] could not create snapshot:", err.message);
    res.status(502).json({ error: err.message, code: err.code || "SNAPSHOT_FAILED" });
  }
});

app.post("/api/send", async (req, res) => {
  const { room_id, text, symbol = "", snapshot } = req.body || {};
  let known;
  try {
    known = await knownRoom(room_id);
  } catch (err) {
    return res.status(502).json({ error: err.message, code: err.code || "UPSTREAM_ERROR" });
  }

  if (!known) {
    return res.status(404).json({ error: "Unknown room.", code: "UNKNOWN_ROOM" });
  }
  const hasSnapshot = snapshot && typeof snapshot.url === "string" && typeof snapshot.preview_url === "string";
  if ((!text || !text.trim()) && !hasSnapshot) {
    return res.status(400).json({ error: "Message is empty.", code: "EMPTY_TEXT" });
  }
  if (text && text.length > 2000) {
    return res.status(400).json({ error: "Message is too long.", code: "TOO_LONG" });
  }
  if (symbol && !/^[A-Za-z0-9_.:-]{1,80}$/.test(symbol)) {
    return res.status(400).json({ error: "Invalid ticker format.", code: "INVALID_SYMBOL" });
  }
  if (snapshot && !hasSnapshot) {
    return res.status(400).json({ error: "Invalid snapshot data.", code: "INVALID_SNAPSHOT" });
  }

  try {
    await sendMessage(room_id, text || "", {
      symbol,
      meta: hasSnapshot
        ? { text: "Chart Snapshot", url: snapshot.url, preview_url: snapshot.preview_url, type: "snapshot" }
        : { text: "" },
      isPrivate: Boolean(known.is_private),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[tv-chat-viewer] could not send to room ${room_id}:`, err.message);
    res.status(502).json({ error: err.message, code: err.code || "SEND_FAILED" });
  }
});

async function start() {
  try {
    console.log("[tv-chat-viewer] preparing TradingView session…");
    cookieJar = await auth.ensureSession({
      username: TV_USERNAME,
      password: TV_PASSWORD,
      manualCookies: hasManualCookies
        ? { sessionid: TV_SESSIONID, sessionid_sign: TV_SESSIONID_SIGN, device_t: TV_DEVICE_T }
        : null,
    });
  } catch (err) {
    console.error(`\n[tv-chat-viewer] Sign-in failed: ${err.message}\n`);
    if (err.code === "LOGIN_FAILED" || err.code === "LOGIN_REJECTED") {
      console.error(
        "[tv-chat-viewer] Tip: if this is a CAPTCHA issue, use manual cookies " +
          "(see the README section on CAPTCHA during automatic sign-in).\n"
      );
    }
    process.exit(1);
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`\n[tv-chat-viewer] running at http://127.0.0.1:${PORT}\n`);
  });
}

start();
