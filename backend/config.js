// Load relative to the backend, regardless of the process working directory.
require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });
function googleClientId(override) {
  const value = String(override ?? process.env.GOOGLE_CLIENT_ID ?? "").trim();
  return !value || /^(?:your[_-]|<)/i.test(value) ? null : value;
}
module.exports = { googleClientId };
