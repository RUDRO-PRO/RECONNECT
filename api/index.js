const { createApp, initializeDatabase, databaseReady } = require("../backend/server.js");
let cachedConn = null;
let initialized = false;

async function ensureDatabase() {
  // Share an in-flight promise, reuse a warm pool, and allow retry after failure/disconnect.
  if (initialized && !databaseReady()) { cachedConn = null; initialized = false; }
  if (!cachedConn) {
    cachedConn = initializeDatabase().then(() => { initialized = true; }).catch(error => {
      cachedConn = null; initialized = false;
      const missing = !process.env.MONGODB_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32;
      const authFailure = error.code === 18 || /authentication failed/i.test(error.message || "");
      const code = missing ? "SERVER_CONFIGURATION_MISSING" : authFailure ? "DATABASE_AUTH_FAILED" : "DATABASE_CONNECTION_FAILED";
      // Do not log connection strings, credentials, provider keys, or driver error bodies.
      console.error(`[Reconnect] ${code}. Check Vercel environment settings, MongoDB credentials/network access, and replica-set support.`);
      const failure = new Error("We couldn't connect to your account service. Please try again shortly.");
      failure.status = 503; failure.publicCode = code;
      throw failure;
    });
  }
  return cachedConn;
}
// Models and middleware are initialized once per warm function, never per request.
const app = createApp({ ensureDatabase });
module.exports = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const routedPath = url.searchParams.get("__path");
  if (routedPath !== null) {
    url.pathname = "/api/" + routedPath;
    url.searchParams.delete("__path");
    req.url = url.pathname + url.search;
  }
  // CORS/OPTIONS and /api/config execute before the connection gate inside Express.
  return app(req, res);
};
