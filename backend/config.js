// Load relative to the backend, regardless of the process working directory.
require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });
function googleClientId(override) {
  const value = String(override ?? process.env.GOOGLE_CLIENT_ID ?? "").trim();
  return !value || /^(?:your[_-]|<)/i.test(value) ? null : value;
}
function apiKeys(value) {
  return [...new Set(String(value || "").split(",").map(key => key.trim()).filter(key => key && !/^(your[_-]|<)/i.test(key)))];
}
// Priority: Gemini (primary) -> Groq -> Mistral -> OpenRouter -> local scorer.
// Each *_API_KEY accepts a comma-separated key pool; no cloud key is required.
function aiProviders(env = process.env) {
  return [
    { name: "gemini", keys: apiKeys(env.GEMINI_API_KEY), model: env.GEMINI_MODEL || "gemini-2.5-flash" },
    { name: "groq", keys: apiKeys(env.GROQ_API_KEY), model: env.GROQ_MODEL || "openai/gpt-oss-120b", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
    { name: "mistral", keys: apiKeys(env.MISTRAL_API_KEY), model: env.MISTRAL_MODEL || "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions" },
    { name: "openrouter", keys: apiKeys(env.OPENROUTER_API_KEY), model: env.OPENROUTER_MODEL || "openrouter/free", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
  ];
}
function allowedOrigins(env = process.env) {
  const origins = new Set(["https://reconnect-network.vercel.app", "http://localhost:5173"]);
  for (const value of [env.FRONTEND_ORIGIN, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    for (const item of String(value || "").split(",")) {
      if (!item.trim()) continue;
      try { const url = new URL(item.includes("://") ? item.trim() : `https://${item.trim()}`); if (["http:", "https:"].includes(url.protocol)) origins.add(url.origin); } catch {}
    }
  }
  return origins;
}
function corsOptions(env = process.env) {
  const allowed = allowedOrigins(env);
  return { origin(origin, callback) {
    // Same-origin Vercel previews are included through their system environment URLs.
    // Do not trust arbitrary *.vercel.app tenants or reflect untrusted Host headers.
    callback(null, !origin || allowed.has(origin));
  }, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] };
}
module.exports = { googleClientId, apiKeys, aiProviders, allowedOrigins, corsOptions };
