import { test } from "node:test";
import assert from "node:assert/strict";
import { publicProfile, profileCard, safeUrl } from "../src/ui.js";
const profile = {
  _id: "profile-id",
  userId: "owner",
  fullName: "Builder",
  headline: "",
  college: {},
  skills: [],
  projects: [],
  interests: [],
  hackathonAvailability: { available: false, domains: [] },
};
test("public pages omit empty sections and owner pages show edit prompts", () => {
  const visitor = publicProfile(profile, { user: null, invitations: [] });
  for (const section of ["About", "Education", "Skills", "Projects"])
    assert.ok(!visitor.includes(`<h2>${section}</h2>`));
  assert.ok(!visitor.includes("Add your first project"));
  const owner = publicProfile(profile, {
    user: { id: "owner" },
    invitations: [],
  });
  assert.ok(owner.includes("Add your first project"));
  assert.ok(owner.includes("Delete Profile"));
});
test("stored profile text is escaped and unsafe links never become clickable", () => {
  const hostile = {
    ...profile,
    fullName: "<img src=x onerror=alert(1)>",
    about: "<script>alert(1)</script>",
    skills: [
      {
        name: "<svg/onload=alert(1)>",
        category: "Backend",
        proficiency: "Advanced",
      },
    ],
    projects: [
      {
        title: "</h3><script>x</script>",
        description: "<img>",
        repoUrl: "javascript:alert(1)",
        techStack: [],
      },
    ],
    avatar: "javascript:alert(1)",
  };
  const html =
    publicProfile(hostile, { user: null, invitations: [] }) +
    profileCard(hostile, { user: null, invitations: [] });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(safeUrl("data:text/html,unsafe"), "");
  assert.equal(safeUrl("https://user:pass@example.com"), "");
});
test("accepted and incoming connections render actionable state without fabricating profiles", () => {
  const accepted = profileCard(profile, {
    user: { id: "viewer" },
    invitations: [
      { senderId: "viewer", receiverId: "owner", status: "accepted" },
    ],
  });
  assert.match(accepted, /disabled>Connected/);
  const incoming = profileCard(profile, {
    user: { id: "viewer" },
    invitations: [
      { senderId: "owner", receiverId: "viewer", status: "pending" },
    ],
  });
  assert.ok(incoming.includes('data-incoming="true"'));
  assert.ok(incoming.includes("Respond in notifications"));
});

test("uploaded avatars render only allowlisted raster data URLs", async () => {
  const { avatarUrl, avatar } = await import("../src/ui.js");
  const photo = "data:image/jpeg;base64,/9j/AA==";
  assert.equal(avatarUrl(photo), photo);
  assert.ok(avatar({ avatar: photo }).includes(photo));
  assert.equal(avatarUrl("data:image/svg+xml;base64,PHN2Zz4="), "");
  assert.equal(avatarUrl("data:image/jpeg;base64,abc\" onerror=alert(1)"), "");
  assert.equal(avatarUrl("data:image/jpeg;base64," + "A".repeat(700000)), "");
});

test("community cards escape content and share the same encoded invite URL", async () => {
  const { communityCard } = await import("../src/communities.js");
  globalThis.window = { location: { origin: "https://reconnect.test" } };
  try {
    const html = communityCard({ name: "<script>bad</script>", description: "<img>", tags: ["C++"], inviteCode: "abcdefghijkl", memberCount: 2, joined: true });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("disabled"));
    assert.ok(html.includes("Copy Invite Link"));
    assert.ok(html.includes("https://wa.me/?text="));
    assert.ok(decodeURIComponent(html).includes("https://reconnect.test/?joinCommunity=abcdefghijkl"));
  } finally { delete globalThis.window; }
});
