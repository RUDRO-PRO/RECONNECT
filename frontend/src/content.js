import { communityCard } from "./communities.js";
import { escape, link, tags, profileCard } from "./ui.js";
const section = (title, body) =>
  `<section class="resource-section"><h2>${title}</h2>${body}</section>`;
const paragraph = (text) => `<p>${text}</p>`;
const pages = {
  "/resources/faq": [
    "Frequently Asked Questions",
    section(
      "Who is Reconnect for?",
      paragraph(
        "Students, developers, designers, and other builders looking for complementary collaborators. Publish only work and skills that accurately represent you.",
      ),
    ) +
      section(
        "How do connections work?",
        paragraph(
          "Publish a profile, invite a builder, and wait for them to accept. Account email addresses become visible only to accepted connections. Declined invitations cannot currently be resent.",
        ),
      ) +
      section(
        "How does AI matching work?",
        paragraph(
          "The matchmaker compares your saved skills, headline, interests, and event domains with registered builders who are available. It returns only profiles in the database and excludes builders you have already invited. An empty result means no eligible matches were found.",
        ),
      ) +
      section(
        "How do I recover my account?",
        paragraph(
          "Choose Sign In, then Forgot Password. Enter your account email and the six-digit code sent to it. Codes expire after ten minutes and can be used once. Contact support if your recovery email does not arrive.",
        ),
      ) +
      section(
        "Are skills verified?",
        paragraph(
          "No. Skill categories and proficiency badges are self-assessed. Review project repositories, demos, and other proof of work before forming a team.",
        ),
      ),
  ],
  "/resources/skills": [
    "Skill Badges",
    paragraph(
      "Skill badges describe the abilities builders choose to publish. They are self-assessments, not certifications or independent verification.",
    ) +
      section(
        "Learning",
        paragraph("A builder is developing familiarity with the skill."),
      ) +
      section(
        "Comfortable",
        paragraph(
          "A builder reports being comfortable applying the skill to projects.",
        ),
      ) +
      section(
        "Advanced",
        paragraph(
          "A builder reports deeper experience with the skill. Check their public work to understand that experience.",
        ),
      ) +
      paragraph(
        '<a href="/#discovery" data-route>Explore builders and their real project links →</a>',
      ),
  ],
  "/resources/api": [
    "API Documentation",
    paragraph(
      "The Reconnect REST API uses JSON. Protected routes require an eight-hour session token in the Authorization header: Bearer &lt;token&gt;. Never place credentials in URLs.",
    ) +
      section(
        "Identity",
        `<dl><dt>POST /api/auth/register</dt><dd>fullName, email, password (8 characters minimum; 72 UTF-8 bytes maximum).</dd><dt>POST /api/auth/login</dt><dd>email, password. Returns a signed session token and user.</dd><dt>POST /api/auth/google</dt><dd>credential: the Google Identity Services ID token.</dd><dt>POST /api/auth/forgot-password</dt><dd>email. Sends a six-digit code through the configured mail provider.</dd><dt>POST /api/auth/verify-otp-reset</dt><dd>email, otp, password. /api/auth/reset-password is an alias.</dd><dt>GET /api/auth/me · POST /api/auth/logout</dt><dd>Current account and session revocation.</dd></dl>`,
      ) +
      section(
        "Profiles & discovery",
        `<dl><dt>GET /api/profiles</dt><dd>Optional query fields: search, skill, college, available=true|false.</dd><dt>GET /api/profiles/:id</dt><dd>Read the current published profile.</dd><dt>POST /api/profiles</dt><dd>Create or replace your profile. Required: fullName. Optional: avatar, headline, college, about, skills, interests, projects, resumeUrl, hackathonAvailability, mentorshipAvailable.</dd><dt>PUT /api/profiles/:id · DELETE /api/profiles/:id</dt><dd>Owner-only update/delete. Deleting a profile closes its team's listings.</dd><dt>GET /api/projects · GET /api/colleges · GET /api/mentors</dt><dd>Project showcase, college counts, and builders who opted into mentoring.</dd><dt>POST /api/match</dt><dd>Matches against your persisted profile, never client-supplied identity.</dd></dl>`,
      ) +
      section(
        "Teams & connections",
        `<dl><dt>GET /api/teams · GET /api/teams/me</dt><dd>Active team listings or your owned listings.</dd><dt>POST /api/teams · PUT /api/teams/:id · DELETE /api/teams/:id</dt><dd>Owner-controlled team listings with event, open slots, domains, and needed skills.</dd><dt>GET /api/teams/saved</dt><dd>Your saved team listings.</dd><dt>POST /api/teams/:id/save · DELETE /api/teams/:id/save</dt><dd>Save or unsave a team.</dd><dt>POST /api/invitations</dt><dd>receiverId. Creates an invitation and recipient notification atomically.</dd><dt>GET /api/notifications</dt><dd>Your notifications only.</dd><dt>POST /api/notifications/:id/respond</dt><dd>action: accept or decline. Recipient only.</dd><dt>GET /api/connections</dt><dd>Contact details shared by accepted connections.</dd><dt>GET /api/health</dt><dd>Live database check and integration configuration status.</dd></dl>`,
      ),
  ],
  "/legal/privacy": [
    "Privacy Policy",
    paragraph(
      "Reconnect stores the information needed to operate your account and the collaboration features described here.",
    ) +
      section(
        "Account information",
        paragraph(
          "Email registration stores your name, email, and a bcrypt password hash. Google sign-in stores your verified Google subject, name, email, and avatar. Password reset codes are stored as keyed hashes with a ten-minute expiry.",
        ),
      ) +
      section(
        "Public information",
        paragraph(
          "Your published profile, projects, skill assessments, education, availability, mentoring opt-in, and team listings are visible to visitors. Do not publish private information or material you do not have permission to share.",
        ),
      ) +
      section(
        "Private information",
        paragraph(
          "Invitations, saved teams, and notifications are associated with your account. Your account email is shared with the other builder after a connection is accepted. It is not included in the public profile API.",
        ),
      ) +
      section(
        "Third-party processing",
        paragraph(
          "Google verifies Google sign-in. When you request AI matching, a matching service may receive your skills, interests, event domains, and eligible candidates’ corresponding profile fields and opaque IDs. Account emails and photos are not sent for matching. Password recovery uses the configured email provider. Images and links you add may contact their hosting providers.",
        ),
      ) +
      section(
        "Your controls",
        paragraph(
          "Edit or remove public content through My Profile and your team editor. Deleting your public profile closes owned team listings; it does not delete your account or existing invitation history. Logging out revokes your existing sessions.",
        ),
      ),
  ],
  "/legal/terms": [
    "Terms of Service",
    section(
      "Using Reconnect",
      paragraph(
        "Use Reconnect to present your own work, discover collaborators, and communicate respectfully. You are responsible for the accuracy of your profile and for maintaining control of your account.",
      ),
    ) +
      section(
        "Your content",
        paragraph(
          "Only publish content and links you have the right to share. Publishing a profile or project makes that information available to visitors. You can edit or remove your published content through the application.",
        ),
      ) +
      section(
        "Collaboration",
        paragraph(
          "An invitation or AI suggestion is not a guarantee of skill, compatibility, employment, funding, or event admission. Agree directly with teammates on responsibilities, intellectual property, deadlines, and any expenses before beginning work.",
        ),
      ) +
      section(
        "Acceptable use",
        paragraph(
          "Do not impersonate others, harass builders, send unsolicited bulk invitations, exploit security flaws, or publish malicious links. Respect third-party licenses and event rules.",
        ),
      ) +
      section(
        "Availability",
        paragraph(
          "Features depend on database connectivity and configured third-party services. Review the status page for current checks. Reconnect does not promise uninterrupted service or successful matching.",
        ),
      ),
  ],
  "/legal/guidelines": [
    "Community Guidelines",
    section(
      "Show the work",
      paragraph(
        "Describe what you built and your contribution accurately. Link to repositories or demos when you can share them publicly. Do not claim qualifications or ownership you do not have.",
      ),
    ) +
      section(
        "Invite thoughtfully",
        paragraph(
          "Explain your project to accepted connections, respect declined invitations, and avoid repeated unsolicited contact. Keep availability and team needs current.",
        ),
      ) +
      section(
        "Build inclusively",
        paragraph(
          "Welcome different skill levels and backgrounds. Give constructive feedback, credit collaborators, and make expectations clear before committing to a team.",
        ),
      ),
  ],
  "/legal/conduct": [
    "Code of Conduct",
    section(
      "Respect people",
      paragraph(
        "Harassment, threats, discriminatory abuse, doxxing, impersonation, and unwanted sexual attention are not acceptable. Respect other people’s boundaries and privacy.",
      ),
    ) +
      section(
        "Collaborate responsibly",
        paragraph(
          "Discuss disagreements about the work without attacking the person. Obtain permission before sharing private conversations or another builder’s contact details.",
        ),
      ) +
      section(
        "Protect the community",
        paragraph(
          "Do not publish malware, stolen credentials, or deceptive links. Stop contact when asked. If an official community channel is configured, use its reporting tools to flag abuse there.",
        ),
      ),
  ],
  "/legal/cookies": [
    "Cookie Policy",
    section(
      "Local storage",
      paragraph(
        "Reconnect stores the signed session token under reconnect_token and your theme preference under reconnect_theme in localStorage. The token expires after eight hours. Signing out removes the local token and revokes existing account sessions.",
      ),
    ) +
      section(
        "Third-party services",
        paragraph(
          "Google Identity Services and other linked providers may use their own cookies and storage under their policies. Reconnect loads Google sign-in and Google-hosted fonts; the interactive canvas loads its external image asset.",
        ),
      ) +
      section(
        "No advertising cookies in this application",
        paragraph(
          "The application does not include advertising trackers or an analytics SDK. If additional services are introduced, this policy should be updated to describe them.",
        ),
      ),
  ],
};
export async function contentPage(path, { api, state, health }) {
  if (pages[path])
    return `<article class="resource-page"><p class="eyebrow">RECONNECT / RESOURCES & TRUST</p><h1>${pages[path][0]}</h1>${pages[path][1]}</article>`;
  const social = path.match(
    /^\/resources\/(github|linkedin|twitter|discord)$/,
  )?.[1];
  if (social) {
    const title = {
      github: "GitHub Organization",
      linkedin: "LinkedIn",
      twitter: "X / Twitter",
      discord: "Community Discord",
    }[social];
    return `<article class="resource-page"><p class="eyebrow">STAY CONNECTED</p><h1>${title}</h1>${state.links?.[social] ? `<p>Visit Reconnect’s official ${title} destination.</p><div class="card-links">${link(state.links[social], title)}</div>` : "<p>An official link has not been published yet. Check back here for the verified community destination.</p>"}</article>`;
  }
  if (path === "/projects") {
    const [projects, communities] = await Promise.all([api("/projects"), api("/communities")]);
    return `<p class="eyebrow">BUILT BY THE COMMUNITY</p><h1>Community & Projects</h1><p class="muted">Find your people. Build something together.</p><button class="primary" data-create-community>Create Community</button><section class="community-section"><h2>Communities</h2><div class="cards">${communities.length ? communities.map(communityCard).join("") : '<p class="empty">Start the first community around your skills and interests.</p>'}</div></section><h2>Projects</h2><div class="cards showcase-grid">${projects.length ? projects.map((p) => `<article class="card"><p class="eyebrow"><a href="/profile/${p.builder.profileId}" data-route>${escape(p.builder.fullName)}</a></p><h3>${escape(p.title)}</h3>${p.description ? `<p class="preserve-lines">${escape(p.description)}</p>` : ""}${tags(p.techStack || [])}<div class="card-links">${link(p.repoUrl, "Repository")}${link(p.liveUrl, "Live project")}</div></article>`).join("") : '<div class="empty"><h2>No projects published yet.</h2><p>Share something you built from your profile.</p><button data-edit-profile>Add your first project</button></div>'}</div>`;
  }
  if (path === "/hubs") {
    const colleges = await api("/colleges");
    return `<p class="eyebrow">BUILD ON YOUR CAMPUS</p><h1>College Hubs</h1><div class="cards showcase-grid">${colleges.length ? colleges.map((c) => `<article class="card"><h3>${escape(c._id)}</h3><p>${c.builders} published builder${c.builders === 1 ? "" : "s"}</p><button data-college="${escape(c._id)}">Explore this college</button></article>`).join("") : '<div class="empty">No colleges have been added to published profiles yet.</div>'}</div>`;
  }
  if (path === "/mentorship") {
    const mentors = await api("/mentors");
    return `<p class="eyebrow">LEARN FROM EACH OTHER</p><h1>Open to Mentoring</h1><p class="muted">Builders who have chosen to help others. Connect to discuss availability and expectations.</p><div class="cards showcase-grid">${mentors.length ? mentors.map((p) => profileCard(p, state)).join("") : '<div class="empty"><h2>No mentors have opted in yet.</h2><p>You can offer your support from your profile’s collaboration preferences.</p><button data-edit-profile>Edit mentoring preferences</button></div>'}</div>`;
  }
  if (path === "/calendar") {
    const teams = await api("/teams");
    const today = new Date();
    const localDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    const events = teams
      .filter((t) => t.eventDate && t.eventDate >= localDate)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return `<p class="eyebrow">YOUR NEXT CHALLENGE</p><h1>Hackathon Calendar</h1><p class="muted">Upcoming dates submitted by active team owners. Check the official event link for details.</p><div class="cards showcase-grid">${events.length ? events.map((t) => `<article class="card"><time class="event-date">${escape(new Date(t.eventDate + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))}</time><h3>${escape(t.event)}</h3><p>${escape(t.name)} · ${t.openSlots} open slots</p>${tags(t.domains)}<div class="card-links">${link(t.eventUrl, "Event")}<a href="/teams" data-route>Find this team →</a></div></article>`).join("") : '<div class="empty">No upcoming dated events have been published by active teams.</div>'}</div>`;
  }
  if (path === "/status") {
    const h = await health();
    return `<article class="resource-page"><h1>System Status</h1><p>${h.status === "unavailable" ? "We're temporarily unavailable. Please try again shortly." : "All Systems Operational"}</p><button data-refresh-content>Refresh status</button></article>`;
  }
  return '<article class="resource-page"><h1>Page not found</h1><p><a href="/" data-route>Return to Reconnect →</a></p></article>';
}
