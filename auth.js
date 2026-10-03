const fs = require("fs");
const path = require("path");

const SESSION_FILE = path.join(__dirname, "session.json");

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  Referer: "https://www.tradingview.com",
};

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveSession(cookieJar) {
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify({ cookies: cookieJar, savedAt: new Date().toISOString() }, null, 2)
  );
}

// Parse every Set-Cookie response header into a { name: value } object.
function parseSetCookies(res) {
  const jar = {};
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    jar[name] = value;
  }
  return jar;
}

function cookieJarToHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Sign in to TradingView with a username and password.
 * This endpoint is also used by other open-source projects (tradingview-screener
 * and tradingview-rs) to obtain session cookies without a browser.
 *
 * NOTE: TradingView rate-limits this sign-in route and may request a CAPTCHA
 * when called too frequently. It is deliberately not called for every request;
 * it is used only when no session exists or the session has expired.
 */
async function login(username, password) {
  const res = await fetch("https://www.tradingview.com/accounts/signin/", {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ username, password, remember: "on" }).toString(),
  });

  const newCookies = parseSetCookies(res);
  let body = {};
  try {
    body = await res.json();
  } catch {
    // A non-JSON response (for example, an HTML error page) leaves body as {}.
  }

  if (body && body.error) {
    const err = new Error(`TradingView rejected the sign-in: ${body.error}`);
    err.code = "LOGIN_REJECTED";
    throw err;
  }

  if (!newCookies.sessionid) {
    // This may indicate CAPTCHA, two-factor authentication, or invalid credentials.
    const hint =
      res.status === 403
        ? "A CAPTCHA may be required because the sign-in API was called too often. Wait a while, or sign in manually through the browser first."
        : "The username/password is incorrect, or this account needs additional verification (2FA/CAPTCHA) that this script does not support.";
    const err = new Error(`Sign-in failed: session cookies were not received. ${hint}`);
    err.code = "LOGIN_FAILED";
    throw err;
  }

  saveSession(newCookies);
  console.log("[auth] Sign-in successful; session saved to session.json");
  return newCookies;
}

/**
 * Use manually supplied browser cookies from a completed interactive sign-in.
 * This is the fallback when automatic username/password sign-in encounters CAPTCHA.
 */
function useManualCookies({ sessionid, sessionid_sign, device_t }) {
  const jar = { sessionid, sessionid_sign, device_t };
  saveSession(jar);
  console.log("[auth] Using manual cookies; session saved to session.json");
  return jar;
}

/**
 * Ensure a valid session using this priority order:
 * 1. An existing session.json file from a previous sign-in method
 * 2. Manual cookies from .env, when supplied
 * 3. Automatic username/password sign-in, which can encounter CAPTCHA
 */
async function ensureSession({ username, password, manualCookies }) {
  const existing = loadSession();
  if (existing && existing.cookies && existing.cookies.sessionid) {
    return existing.cookies;
  }
  if (manualCookies && manualCookies.sessionid) {
    return useManualCookies(manualCookies);
  }
  return login(username, password);
}

module.exports = {
  login,
  ensureSession,
  useManualCookies,
  loadSession,
  saveSession,
  cookieJarToHeader,
  COMMON_HEADERS,
};
