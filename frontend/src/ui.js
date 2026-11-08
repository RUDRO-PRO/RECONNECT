export const $ = (id) => document.getElementById(id);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? escape(u.href)
      : "";
  } catch {
    return "";
  }
};
export const tags = (values) =>
  `<div class="tags">${values.map((s) => `<span class="tag">${escape(typeof s === "string" ? s : s.name)}</span>`).join("")}</div>`;
export const link = (url, label) =>
  safeUrl(url)
    ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`
    : "";
export const avatarUrl = (value) => /^\/api\/avatars\/[a-f\d]{24}\?v=[a-f\d]{12}$/i.test(value || "") ? value : typeof value === "string" && value.length <= 700000 && /^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : safeUrl(value);
export const avatar = (p) =>
  avatarUrl(p.avatar)
    ? `<img class="profile-avatar" src="${avatarUrl(p.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="initial">${escape((p.fullName || p.name || "?").charAt(0).toUpperCase())}</span>`;
export function inviteButton(userId, state) {
  const own = userId === state.user?.id;
  const i = state.invitations.find(
    (i) => i.senderId === userId || i.receiverId === userId,
  );
  if (i?.status === "accepted" && !own) return `<button class="primary" data-message="${escape(userId)}">Message</button>`;
  const incoming = i?.status === "pending" && i.receiverId === state.user?.id;
  const label = own
    ? "Your profile"
    : i?.status === "accepted"
      ? "Connected ✓"
      : i?.status === "rejected"
        ? "Invitation declined"
        : i
          ? incoming
            ? "Respond in notifications"
            : "Invited ✓"
          : "Connect & Send Note";
  return `<button data-invite="${escape(userId)}" ${incoming ? 'data-incoming="true"' : ""} ${own || (i && !incoming) ? "disabled" : ""}>${label}</button>`;
}
export function profileCard(p, state) {
  return `<article class="card builder-card">${avatar(p)}<h3><a class="profile-card-link" href="/profile/${escape(p._id)}" data-profile-modal="${escape(p._id)}">${escape(p.fullName)}</a></h3>${p.headline ? `<p>${escape(p.headline)}</p>` : ""}${p.college?.institution ? `<p>${escape(p.college.institution)}</p>` : ""}${tags(p.skills || [])}${p.proofOfWork ? `<p>${escape(p.proofOfWork)}</p>` : ""}${p.hackathonAvailability?.available ? '<p class="availability">● Available for Hackathons</p>' : ""}${p.matchReason ? `<p class="match-reason">${escape(p.matchReason)}</p>` : ""}<div class="card-links"><a href="/profile/${escape(p._id)}" data-profile-modal="${escape(p._id)}">View profile ↗</a>${link(p.githubUrl, "GitHub")}</div>${inviteButton(p.userId, state)}</article>`;
}
export function publicProfile(p, state) {
  const own = p.userId === state.user?.id;
  const section = (title, content, prompt) =>
    content
      ? `<section class="profile-section"><h2>${title}</h2>${content}</section>`
      : own
        ? `<section class="profile-section owner-prompt"><h2>${title}</h2><button data-edit-profile>${prompt}</button></section>`
        : "";
  const education = [
    p.college?.institution,
    p.college?.degree,
    p.college?.department,
    p.college?.batchYear,
  ].filter(Boolean);
  return `<a href="/#discovery" data-route class="back-link">← Explore builders</a><div class="profile-cover"></div><section class="profile-identity">${avatar(p)}<div><h1>${escape(p.fullName)}</h1>${p.headline ? `<p class="headline">${escape(p.headline)}</p>` : ""}${p.college?.institution ? `<p class="muted">${escape(p.college.institution)}${p.college.batchYear ? ` · Class of ${escape(p.college.batchYear)}` : ""}</p>` : ""}${p.hackathonAvailability?.available ? '<p class="availability">● Open to hackathon teammates</p>' : ""}</div><div class="profile-actions">${own ? '<button class="primary" data-edit-profile>Edit Profile</button><button class="danger" data-delete-profile>Delete Profile</button>' : inviteButton(p.userId, state)}</div><div class="card-links">${link(p.githubUrl, "GitHub")}${link(p.portfolioUrl, "Portfolio")}${link(p.resumeUrl, "Resume")}</div></section><div class="profile-layout"><div>${section("About", p.about ? `<p class="preserve-lines">${escape(p.about)}</p>` : "", "Tell your story")}${section("Projects", p.projects?.length ? p.projects.map((project) => `<article class="project-card"><h3>${escape(project.title)}</h3>${project.description ? `<p class="preserve-lines">${escape(project.description)}</p>` : ""}${tags(project.techStack || [])}<div class="card-links">${link(project.repoUrl, "GitHub Repository")}${link(project.liveUrl, "Live Demo")}</div></article>`).join("") : "", "Add your first project")}${section("Proof of work", p.proofOfWork ? `<p class="preserve-lines">${escape(p.proofOfWork)}</p>` : "", "Share an achievement")}</div><aside>${section("Education", education.length ? `<p>${education.map(escape).join("<br>")}</p>` : "", "Add your education")}${section("Skills", p.skills?.length ? `<p class="muted">Self-assessed proficiency</p>${p.skills.map((s) => `<div class="skill-detail"><strong>${escape(s.name)}</strong>${s.category ? `<span>${escape(s.category)}</span>` : ""}${s.proficiency ? `<span class="tag">${escape(s.proficiency)}</span>` : ""}</div>`).join("")}` : "", "Add your first skill")}${section("Interests", p.interests?.length ? tags(p.interests) : "", "Add your interests")}${section("Open to roles", p.hackathonAvailability?.roles?.length ? tags(p.hackathonAvailability.roles) : "", "Add collaboration roles")}${section("Target event domains", p.hackathonAvailability?.domains?.length ? tags(p.hackathonAvailability.domains) : "", "Choose event domains")}</aside></div>`;
}
export function skillRow(s = {}) {
  return `<div class="skill-row repeater"><label>Skill<input data-field="name" maxlength="50" required value="${escape(s.name)}"></label><label>Category<input data-field="category" maxlength="50" value="${escape(s.category)}" placeholder="e.g. Backend"></label><label>Proficiency<select data-field="proficiency">${["", "Learning", "Comfortable", "Advanced"].map((v) => `<option value="${v}" ${v === (s.proficiency || "") ? "selected" : ""}>${v || "Not specified"}</option>`).join("")}</select></label><button type="button" data-remove-row aria-label="Remove skill">×</button></div>`;
}
export function projectRow(p = {}) {
  return `<fieldset class="project-row repeater"><legend>Project</legend><label>Title<input data-field="title" required maxlength="120" value="${escape(p.title)}"></label><label>Description<textarea data-field="description" maxlength="3000" rows="3">${escape(p.description)}</textarea></label><label>Tech stack (comma separated)<input data-field="techStack" maxlength="1800" value="${escape(p.techStack?.join(", "))}"></label><div class="form-row"><label>Live URL<input data-field="liveUrl" type="url" maxlength="2048" value="${escape(p.liveUrl)}"></label><label>Repository URL<input data-field="repoUrl" type="url" maxlength="2048" value="${escape(p.repoUrl)}"></label></div><button type="button" data-remove-row>Remove project</button></fieldset>`;
}
