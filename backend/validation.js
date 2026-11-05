const { availability } = require("./models/Profile");
function bad(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
function profileInput(body) {
  const result = {};
  for (const [key, max] of Object.entries({
    fullName: 100,
    roleTag: 100,
    proofOfWork: 1500,
  })) {
    if (
      typeof body[key] !== "string" ||
      !body[key].trim() ||
      body[key].trim().length > max
    )
      bad(`${key} is required (maximum ${max} characters).`);
    result[key] = body[key].trim();
  }
  if (
    !Array.isArray(body.skills) ||
    !body.skills.length ||
    body.skills.length > 30 ||
    body.skills.some(
      (s) => typeof s !== "string" || !s.trim() || s.trim().length > 50,
    )
  )
    bad("Provide 1–30 skills, each up to 50 characters.");
  result.skills = [...new Set(body.skills.map((s) => s.trim()))];
  if (!availability.includes(body.availabilityStatus))
    bad("Choose a valid availability status.");
  result.availabilityStatus = body.availabilityStatus;
  for (const key of ["githubUrl", "portfolioUrl"]) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.length > 2048)
      bad(`Invalid ${key}.`);
    result[key] = value.trim();
    if (!result[key]) continue;
    let url;
    try {
      url = new URL(result[key]);
    } catch {
      bad(`Invalid ${key}.`);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      bad(`${key} must be an HTTP or HTTPS link.`);
    if (
      key === "githubUrl" &&
      !["github.com", "www.github.com"].includes(url.hostname)
    )
      bad("GitHub URL must use github.com.");
  }
  return result;
}
module.exports = { profileInput, bad };
