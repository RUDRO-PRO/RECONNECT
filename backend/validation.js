const { availability } = require("./models/Profile");
function bad(message) {
  const e = new Error(message);
  e.status = 400;
  throw e;
}
function object(value, label = "Request") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    bad(`${label} must be an object.`);
  return value;
}
function text(value, label, max = 100, required = false) {
  if (value === undefined || value === null) value = "";
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    bad(
      `${label}${required ? " is required and" : ""} must be text up to ${max} characters.`,
    );
  return value.trim();
}
function list(value, label, max = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max)
    bad(`${label} must contain at most ${max} items.`);
  return [...new Set(value.map((v) => text(v, label, 60, true)))];
}
function url(value, label) {
  const result = text(value, label, 2048);
  if (!result) return "";
  let parsed;
  try {
    parsed = new URL(result);
  } catch {
    bad(`${label} must be a valid URL.`);
  }
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    bad(`${label} must use HTTP or HTTPS without embedded credentials.`);
  return result;
}
function emailInput(value) {
  return require("./utils/emailValidator").normalizeEmail(value);
}
function passwordInput(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    Buffer.byteLength(value, "utf8") > 72
  )
    bad("Password must have at least 8 characters and at most 72 UTF-8 bytes.");
  return value;
}
function profileInput(body) {
  object(body);
  const result = { fullName: text(body.fullName, "Full name", 100, true) };
  result.headline = text(body.headline ?? body.roleTag, "Headline", 200);
  result.roleTag = result.headline;
  const photo = text(body.avatar, "Profile photo", 700000);
  if (photo.startsWith("data:")) {
    if (!/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) bad("Choose a JPEG or WebP profile photo.");
    result.avatar = photo;
  } else result.avatar = url(photo, "Profile photo");
  result.about = text(body.about, "About", 5000);
  result.proofOfWork = text(body.proofOfWork, "Proof of work", 1500);
  for (const key of ["resumeUrl", "githubUrl", "portfolioUrl"])
    result[key] = url(body[key], key);
  if (
    result.githubUrl &&
    !["github.com", "www.github.com"].includes(
      new URL(result.githubUrl).hostname,
    )
  )
    bad("GitHub URL must use github.com.");
  const college = object(body.college ?? {}, "Education");
  result.college = {};
  for (const key of ["institution", "degree", "department"])
    result.college[key] = text(college[key], key, 150);
  result.college.batchYear = text(college.batchYear, "Batch year", 4);
  if (
    result.college.batchYear &&
    !/^(19|20|21)\d{2}$/.test(result.college.batchYear)
  )
    bad("Batch year must be a four-digit year.");
  if (
    body.skills !== undefined &&
    (!Array.isArray(body.skills) || body.skills.length > 40)
  )
    bad("Provide at most 40 skills.");
  result.skills = (body.skills ?? []).map((s) => {
    if (typeof s === "string") s = { name: s };
    object(s, "Skill");
    const proficiency = s.proficiency ?? "";
    if (!["", "Learning", "Comfortable", "Advanced"].includes(proficiency))
      bad("Choose a valid skill proficiency.");
    return {
      name: text(s.name, "Skill name", 50, true),
      category: text(s.category, "Skill category", 50),
      proficiency,
    };
  });
  result.interests = list(body.interests, "Interests");
  if (
    body.projects !== undefined &&
    (!Array.isArray(body.projects) || body.projects.length > 20)
  )
    bad("Provide at most 20 projects.");
  result.projects = (body.projects ?? []).map((p) => {
    object(p, "Project");
    return {
      title: text(p.title, "Project title", 120, true),
      description: text(p.description, "Project description", 3000),
      techStack: list(p.techStack, "Tech stack"),
      liveUrl: url(p.liveUrl, "Live URL"),
      repoUrl: url(p.repoUrl, "Repository URL"),
    };
  });
  const h = body.hackathonAvailability;
  if (h !== undefined) {
    object(h, "Hackathon availability");
    if (typeof h.available !== "boolean")
      bad("Hackathon availability must be true or false.");
    result.hackathonAvailability = {
      available: h.available,
      domains: list(h.domains, "Event domains"),
      roles: list(h.roles, "Open-to-work roles"),
    };
    result.availabilityStatus = h.available ? availability[0] : "Exploring";
  } else {
    result.availabilityStatus = body.availabilityStatus ?? "Exploring";
    if (!availability.includes(result.availabilityStatus))
      bad("Choose a valid availability status.");
    result.hackathonAvailability = {
      available: result.availabilityStatus === availability[0],
      domains: [],
      roles: [],
    };
  }
  if (
    body.mentorshipAvailable !== undefined &&
    typeof body.mentorshipAvailable !== "boolean"
  )
    bad("Mentorship availability must be true or false.");
  result.mentorshipAvailable = body.mentorshipAvailable ?? false;
  return result;
}
function normalizeProfile(p) {
  if (!p) return null;
  return {
    ...p,
    headline: p.headline || p.roleTag || "",
    skills: (p.skills || []).map((s) =>
      typeof s === "string" ? { name: s, category: "", proficiency: "" } : s,
    ),
    college: p.college || {},
    about: p.about || "",
    interests: p.interests || [],
    projects: p.projects || [],
    hackathonAvailability: p.hackathonAvailability ?? {
      available: p.availabilityStatus === availability[0],
      domains: [],
    },
  };
}
function teamInput(body) {
  object(body);
  body = { ...body, event: body.hackathonName ?? body.event, skillsNeeded: body.neededRoles ?? body.skillsNeeded, openSlots: body.openSlots ?? 1 };
  const eventDate = text(body.eventDate, "Event date", 10);
  if (
    eventDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      Number.isNaN(Date.parse(eventDate)) ||
      new Date(eventDate).toISOString().slice(0, 10) !== eventDate)
  )
    bad("Choose a valid event date.");
  if (
    !Number.isInteger(body.openSlots) ||
    body.openSlots < 1 ||
    body.openSlots > 20
  )
    bad("Open slots must be a whole number from 1 to 20.");
  if (body.status !== undefined && !["open", "closed"].includes(body.status))
    bad("Choose open or closed team status.");
  return {
    name: text(body.name, "Team name", 100, true),
    event: text(body.event, "Hackathon / event", 150, true),
    hackathonName: text(body.event, "Hackathon / event", 150, true),
    neededRoles: list(body.skillsNeeded, "Needed roles"),
    techStack: list(body.techStack, "Tech stack"),
    description: text(body.description, "Team description", 2000, true),
    domains: list(body.domains, "Domains"),
    skillsNeeded: list(body.skillsNeeded, "Needed skills"),
    openSlots: body.openSlots,
    eventUrl: url(body.eventUrl, "Event URL"),
    eventDate,
    status: body.status || "open",
  };
}
module.exports = {
  bad,
  object,
  text,
  list,
  url,
  emailInput,
  passwordInput,
  profileInput,
  normalizeProfile,
  teamInput,
};
