const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { createApp } = require("../server");
const User = require("../models/User");
const Profile = require("../models/Profile");
const Team = require("../models/Team");
const Invitation = require("../models/Invitation");
const Notification = require("../models/Notification");
const secret = "extended-workflow-secret-at-least-32-characters";
let replica,
  server,
  base,
  mailFailure = false;
const messages = [];
const mailer = {
  async sendMail(message) {
    if (mailFailure) throw new Error("SMTP failure");
    messages.push(message);
    return { accepted: [message.to] };
  },
};
async function request(
  path,
  { token, body, method = body ? "POST" : "GET" } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri());
  await Promise.all([
    User.init(),
    Profile.init(),
    Team.init(),
    Invitation.init(),
    Notification.init(),
  ]);
  server = createApp({
    matchProviders: [],
    secret,
    clientId: "test-client",
    mailer,
    googleClient: {
      async verifyIdToken() {
        return {
          getPayload: () => ({
            sub: "new-google-id",
            email: "owner@example.test",
            email_verified: true,
            name: "Google Owner",
          }),
        };
      },
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (replica) await replica.stop();
});
test("local accounts, secure password recovery, structured profiles, and owned teams", async () => {
  const register = (email, password = "secure-password") =>
    request("/auth/register", {
      body: { fullName: "Builder", email, password },
    });
  assert.equal((await register("invalid")).status, 400);
  assert.equal((await register("short@example.test", "short")).status, 400);
  assert.equal(
    (await register("unicode@example.test", "😀".repeat(20))).status,
    400,
  );
  const a = (await register("Owner@Example.test")).data;
  const b = (await register("visitor@example.test")).data;
  assert.ok(a.token);
  assert.equal(a.user.email, "owner@example.test");
  assert.equal(a.user.authProvider, "local");
  const payload = jwt.verify(a.token, secret);
  assert.equal(payload.exp - payload.iat, 30 * 24 * 60 * 60);
  assert.equal(payload.userId, a.user.id);
  assert.equal(payload.email, a.user.email);
  assert.equal(payload.authProvider, "local");
  assert.equal(jwt.decode(a.token, { complete: true }).header.alg, "HS256");
  const stored = await User.findById(a.user.id).select("+password");
  assert.notEqual(stored.password, "secure-password");
  assert.ok(bcrypt.getRounds(stored.password) >= 10);
  assert.ok(await bcrypt.compare("secure-password", stored.password));
  assert.equal((await register("owner@example.test")).status, 409);
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: "owner@example.test", password: "wrong-password" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: { $ne: null }, password: "secure-password" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: "owner@example.test", password: "secure-password" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/auth/google", {
        body: { credential: "verified-google-token" },
      })
    ).status,
    409,
  );
  const noAccount = await request("/auth/forgot-password", {
    body: { email: "missing@example.test" },
  });
  const reset = await request("/auth/forgot-password", {
    body: { email: "owner@example.test" },
  });
  assert.deepEqual(noAccount.data, reset.data);
  assert.equal(messages.length, 1);
  const otp = messages[0].text.match(/\b\d{6}\b/)[0];
  const saved = await User.findById(a.user.id).select(
    "+resetOtp +resetOtpExpires",
  );
  assert.notEqual(saved.resetOtp, otp);
  assert.ok(saved.resetOtpExpires > Date.now());
  assert.ok(saved.resetOtpExpires - Date.now() <= 600000);
  await request("/auth/forgot-password", {
    body: { email: "owner@example.test" },
  });
  assert.equal(messages.length, 1);
  assert.equal(
    (
      await request("/auth/reset-password", {
        body: {
          email: "owner@example.test",
          otp: otp === "000000" ? "111111" : "000000",
          password: "new-password",
        },
      })
    ).status,
    400,
  );
  const resetResults = await Promise.all(
    ["/auth/reset-password", "/auth/verify-otp-reset"].map((path) =>
      request(path, {
        body: { email: "owner@example.test", otp, password: "new-password" },
      }),
    ),
  );
  assert.deepEqual(resetResults.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await request("/auth/me", { token: a.token })).status, 401);
  assert.equal(
    (
      await request("/auth/reset-password", {
        body: { email: "owner@example.test", otp, password: "other-password" },
      })
    ).status,
    400,
  );
  const fresh = (
    await request("/auth/login", {
      body: { email: "owner@example.test", password: "new-password" },
    })
  ).data;
  await request("/auth/forgot-password", {
    body: { email: "visitor@example.test" },
  });
  const bOtp = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  await User.updateOne(
    { _id: b.user.id },
    { $set: { resetOtpExpires: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (
      await request("/auth/reset-password", {
        body: {
          email: "visitor@example.test",
          otp: bOtp,
          password: "new-password",
        },
      })
    ).status,
    400,
  );
  await User.updateOne({ _id: b.user.id }, { $unset: { resetOtpSentAt: 1 } });
  await request("/auth/forgot-password", {
    body: { email: "visitor@example.test" },
  });
  const nextOtp = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  await User.updateOne({ _id: b.user.id }, { $set: { resetOtpAttempts: 5 } });
  assert.equal(
    (
      await request("/auth/reset-password", {
        body: {
          email: "visitor@example.test",
          otp: nextOtp,
          password: "new-password",
        },
      })
    ).status,
    400,
  );
  const me = await request("/auth/me", { token: fresh.token });
  assert.equal(me.data.password, undefined);
  assert.equal(me.data.resetOtp, undefined);
  const minimal = await request("/profiles", {
    token: fresh.token,
    body: { fullName: "Owner" },
  });
  assert.equal(minimal.status, 200);
  assert.deepEqual(minimal.data.projects, []);
  assert.deepEqual(minimal.data.skills, []);
  const data = {
    fullName: "Owner",
    headline: "Frontend | Robotics",
    avatar: "data:image/jpeg;base64," + "A".repeat(180000),
    college: {
      institution: "Example Institute",
      degree: "B.Tech",
      department: "CSE",
      batchYear: "2027",
    },
    about: "First paragraph.\n\nSecond paragraph.",
    skills: [{ name: "React", category: "Frontend", proficiency: "Advanced" }],
    interests: ["Robotics"],
    projects: [
      {
        title: "Robot console",
        description: "Control interface",
        techStack: ["React", "ROS"],
        repoUrl: "https://github.com/example/robot",
        liveUrl: "https://example.test",
      },
    ],
    resumeUrl: "https://example.test/resume.pdf",
    hackathonAvailability: { available: true, domains: ["Robotics"] },
  };
  const updated = await request(`/profiles/${minimal.data._id}`, {
    token: fresh.token,
    method: "PUT",
    body: data,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.projects[0].title, "Robot console");
  assert.equal(await Profile.countDocuments(), 1);
  const showcase = await request("/projects");
  assert.equal(showcase.data.length, 1);
  assert.equal(showcase.data[0].builder.profileId, minimal.data._id);
  assert.equal(showcase.data[0].title, "Robot console");
  assert.equal((await request("/colleges")).data[0]._id, "Example Institute");
  assert.deepEqual((await request("/mentors")).data, []);
  const storedOwner = await User.findById(updated.data.userId);
  assert.equal(storedOwner.avatar, updated.data.avatar);
  assert.ok(storedOwner.avatar.length > 128 * 1024);
  const publicView = await request(`/profiles/${minimal.data._id}`);
  assert.equal(publicView.data.about, data.about);
  assert.equal(publicView.data.email, undefined);
  assert.equal(
    (
      await request(`/profiles/${minimal.data._id}`, {
        token: b.token,
        method: "PUT",
        body: data,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/profiles/${minimal.data._id}`, {
        token: b.token,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/profiles?skill=React&college=Example&available=true")).data
      .length,
    1,
  );
  assert.equal((await request("/profiles?available=false")).data.length, 0);
  assert.equal((await request("/profiles?college=Missing")).data.length, 0);
  assert.equal((await request("/profiles?available=oops")).status, 400);
  assert.equal(
    (
      await request("/profiles", {
        token: fresh.token,
        body: {
          ...data,
          projects: [{ title: "Unsafe", liveUrl: "javascript:alert(1)" }],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/profiles", {
        token: fresh.token,
        body: {
          ...data,
          skills: [{ name: "React", proficiency: "Verified expert" }],
        },
      })
    ).status,
    400,
  );
  const team = {
    name: "Robot builders",
    event: "Campus hackathon",
    description: "Building an accessible robot interface.",
    domains: ["Robotics"],
    skillsNeeded: ["C++"],
    openSlots: 2,
    eventUrl: "https://example.test/hackathon",
  };
  assert.deepEqual((await request("/teams")).data, []);
  assert.equal((await request("/teams", { body: team })).status, 401);
  assert.equal(
    (await request("/teams", { token: b.token, body: team })).status,
    400,
  );
  const listing = await request("/teams", {
    token: fresh.token,
    body: { ...team, ownerId: b.user.id },
  });
  assert.equal(listing.status, 201);
  assert.equal(
    (await request("/teams/" + listing.data._id + "/save", { body: {} }))
      .status,
    401,
  );
  assert.equal(
    (
      await request("/teams/" + listing.data._id + "/save", {
        token: b.token,
        body: {},
      })
    ).status,
    200,
  );
  await request("/teams/" + listing.data._id + "/save", {
    token: b.token,
    body: {},
  });
  assert.equal(
    (await request("/teams/saved", { token: b.token })).data.length,
    1,
  );
  assert.deepEqual(
    (await request("/teams/saved", { token: fresh.token })).data,
    [],
  );
  await request("/teams/" + listing.data._id + "/save", {
    token: b.token,
    method: "DELETE",
  });
  assert.deepEqual(
    (await request("/teams/saved", { token: b.token })).data,
    [],
  );

  assert.equal(listing.data.ownerId, a.user.id);
  assert.equal((await request("/teams?search=C%2B%2B")).data.length, 1);
  assert.equal(
    (
      await request(`/teams/${listing.data._id}`, {
        token: b.token,
        method: "PUT",
        body: team,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/teams/${listing.data._id}`, {
        token: b.token,
        method: "DELETE",
      })
    ).status,
    404,
  );
  await request(`/teams/${listing.data._id}`, {
    token: fresh.token,
    method: "PUT",
    body: { ...team, status: "closed" },
  });
  assert.deepEqual((await request("/teams")).data, []);
  assert.equal(
    (await request("/teams/me", { token: fresh.token })).data.length,
    1,
  );
  await request(`/teams/${listing.data._id}`, {
    token: fresh.token,
    method: "PUT",
    body: { ...team, status: "open" },
  });
  assert.equal(
    (
      await request(`/profiles/${minimal.data._id}`, {
        token: fresh.token,
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal((await request(`/profiles/${minimal.data._id}`)).status, 404);
  assert.equal((await Team.findById(listing.data._id)).status, "closed");
  assert.deepEqual((await request("/teams")).data, []);
  assert.equal(
    (await request("/auth/logout", { token: fresh.token, body: {} })).status,
    200,
  );
  assert.equal((await request("/auth/me", { token: fresh.token })).status, 401);
  // Test actual legacy database documents without fabricating proficiency claims.
  await Profile.collection.insertOne({
    userId: new mongoose.Types.ObjectId(b.user.id),
    fullName: "Legacy builder",
    roleTag: "Systems",
    skills: ["C++"],
    availabilityStatus: "Open to Hackathons & Dev Groups",
  });
  const legacy = (await request("/profiles?skill=C%2B%2B&available=true"))
    .data[0];
  assert.equal(legacy.headline, "Systems");
  assert.equal(legacy.skills[0].name, "C++");
  assert.equal(legacy.skills[0].proficiency, "");
});

test("community matching is targeted, joins are idempotent, and My Teams includes members", async () => {
  const Community = require("../models/Community");
  await Community.init();
  const account = async name => (await request("/auth/register", { body: { fullName: name, email: `${name}@community.test`, password: "secure-password" } })).data;
  const creator = await account("creator"), matched = await account("matched"), unrelated = await account("unrelated");
  for (const [u, skills, interests] of [[creator, [{ name: "C++" }], []], [matched, [{ name: "c++" }], ["Robotics"]], [unrelated, [{ name: "Cooking" }], ["Music"]]]) {
    assert.equal((await request("/profiles", { token: u.token, body: { fullName: u.user.name, skills, interests } })).status, 200);
  }
  assert.equal((await request("/config")).data.googleClientId, "test-client");
  const created = await request("/communities", { token: creator.token, body: { name: "Systems Builders", tags: ["robotics"] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.memberCount, 1);
  const notices = await Notification.find({ communityId: created.data._id }).lean();
  assert.equal(notices.length, 1);
  assert.equal(String(notices[0].recipientId), matched.user.id);
  assert.match(notices[0].message, /c\+\+/i);
  assert.equal((await request("/communities", { token: matched.token })).data.find(c => c._id === created.data._id).joined, false);
  for (let i = 0; i < 2; i++) {
    const joined = await request(`/communities/${created.data.inviteCode}/join`, { token: matched.token, body: {} });
    assert.equal(joined.status, 200);
    assert.equal(joined.data.memberCount, 2);
    assert.equal(joined.data.joined, true);
  }
  assert.equal((await request(`/communities/${created.data.inviteCode}/join`, { body: {} })).status, 401);
  assert.equal((await request("/communities/invalid/join", { token: matched.token, body: {} })).status, 400);
  const second = await request("/communities", { token: creator.token, body: { name: "Another group", tags: [] } });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  const team = await request("/teams", { token: creator.token, body: { name: "Build team", hackathonName: "Hack Day", description: "Build together", neededRoles: ["Developer"], techStack: ["C++"] } });
  assert.equal(team.status, 201, JSON.stringify(team.data));
  assert.equal(team.data.creatorId, creator.user.id);
  assert.equal(team.data.members[0].userId, creator.user.id);
  await Team.updateOne({ _id: team.data._id }, { $push: { members: { userId: matched.user.id, role: "Developer" } } });
  for (const user of [creator, matched]) assert.ok((await request("/teams/mine", { token: user.token })).data.some(t => t._id === team.data._id));
  assert.ok(!(await request("/teams/mine", { token: unrelated.token })).data.some(t => t._id === team.data._id));
});

test("community rooms, connection notes, direct messages and team invites enforce membership", async t => {
  // Keep this workflow's quota independent of the preceding auth/profile tests.
  const isolated = createApp({ secret, clientId: "", matchProviders: [] }).listen(0, "127.0.0.1");
  await new Promise(resolve => isolated.once("listening", resolve));
  t.after(() => new Promise(resolve => isolated.close(resolve)));
  const request = async (path, { token, body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(`http://127.0.0.1:${isolated.address().port}/api${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const Community = require("../models/Community");
  const DirectMessage = require("../models/DirectMessage");
  const CommunityMessage = require("../models/CommunityMessage");
  await Promise.all([Community.init(), DirectMessage.init(), CommunityMessage.init()]);
  const account = async name => (await request("/auth/register", { body: { fullName: name, email: `${name}@chat.test`, password: "secure-password" } })).data;
  const admin = await account("admin"), member = await account("member"), outsider = await account("outsider");
  for (const u of [admin, member, outsider]) await request("/profiles", { token: u.token, body: { fullName: u.user.name, headline: "Developer", skills: [{ name: "React" }] } });
  const community = (await request("/communities", { token: admin.token, body: { name: "Chat builders", tags: ["React"] } })).data;
  const root = `/communities/${community._id}`;
  assert.equal((await request(root, { token: outsider.token })).status, 403);
  assert.equal((await request(root + "/messages", { token: outsider.token, body: { text: "intrusion" } })).status, 403);
  assert.equal((await request(root + "/add-member", { token: admin.token, body: { userId: member.user.id } })).status, 200);
  assert.equal((await request(root + "/add-member", { token: member.token, body: { userId: outsider.user.id } })).status, 200);
  const details = (await request(root, { token: member.token })).data;
  assert.equal(details.creatorId.name, "admin");
  assert.equal(details.members.length, 3);
  assert.equal(details.members.find(m => m._id === member.user.id).roleTag, "Developer");
  const photo = "data:image/jpeg;base64," + "A".repeat(200000);
  const sent = await request(root + "/messages", { token: member.token, body: { text: "Architecture", imageUrl: photo } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.senderId.name, "member");
  assert.equal((await request(root + "/messages", { token: admin.token })).data[0].imageUrl, photo);
  assert.equal((await request(root + "/messages", { token: member.token, body: {} })).status, 400);
  assert.equal((await request(root + "/messages", { token: member.token, body: { imageUrl: "data:image/svg+xml,unsafe" } })).status, 400);
  assert.equal((await request(root + `/members/${outsider.user.id}`, { token: member.token, method: "DELETE" })).status, 403);
  assert.equal((await request(root + `/members/${admin.user.id}`, { token: admin.token, method: "DELETE" })).status, 400);
  assert.equal((await request(root + `/members/${outsider.user.id}`, { token: admin.token, method: "DELETE" })).status, 200);
  assert.equal((await request(root + "/messages", { token: outsider.token })).status, 403);
  const dm = `/messages/${member.user.id}`;
  assert.equal((await request(dm, { token: admin.token, body: { text: "hello" } })).status, 403);
  const invitation = await request("/invitations", { token: admin.token, body: { receiverId: member.user.id, note: "Let's build together" } });
  assert.equal(invitation.status, 201, JSON.stringify(invitation.data));
  assert.equal(await DirectMessage.countDocuments({ senderId: admin.user.id, recipientId: member.user.id }), 1);
  const notice = await Notification.findOne({ invitationId: invitation.data._id, type: "invitation" });
  assert.equal(notice.note, "Let's build together");
  assert.equal((await request(`/notifications/${notice._id}/respond`, { token: member.token, body: { action: "accept" } })).status, 200);
  const conversations = (await request("/messages/conversations", { token: member.token })).data;
  assert.equal(conversations.find(c => c.id === admin.user.id).unread, 1);
  assert.equal((await request(`/messages/${admin.user.id}`, { token: member.token })).data[0].text, "Let's build together");
  assert.equal((await request("/messages/conversations", { token: member.token })).data.find(c => c.id === admin.user.id).unread, 0);
  assert.equal((await request(dm, { token: admin.token, body: { text: "Next steps?" } })).status, 201);
  const reply = await request("/messages", { token: member.token, body: { recipientId: admin.user.id, text: "Ready!", clientMessageId: "optimistic-reply" } });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.senderId, member.user.id);
  assert.equal(reply.data.recipientId, admin.user.id);
  assert.equal(reply.data.clientMessageId, "optimistic-reply");
  const history = (await request(dm, { token: admin.token })).data;
  assert.equal(history.length, 3);
  assert.equal(history.at(-1)._id, reply.data._id);
  const incremental = await request(`${dm}?after=${encodeURIComponent(reply.data.createdAt)}`, { token: admin.token });
  assert.equal(incremental.status, 200);
  assert.ok(incremental.data.some(m => m._id === reply.data._id));
  assert.ok(incremental.data.every(m => m.createdAt >= reply.data.createdAt));
  assert.equal((await request(`${dm}?after=bad-date`, { token: admin.token })).status, 400);
  // Initial history must not silently discard older messages after 200 entries.
  await DirectMessage.insertMany(Array.from({ length: 201 }, (_, i) => ({ conversationKey: [admin.user.id, member.user.id].sort().join(":"), senderId: admin.user.id, recipientId: member.user.id, text: `Earlier ${i}`, createdAt: new Date(1700000000000 + i) })));
  assert.equal((await request(dm, { token: admin.token })).data.length, 204);
  assert.ok((await DirectMessage.collection.indexes()).some(index => index.key.senderId === 1 && index.key.recipientId === 1 && index.key.createdAt === 1));
  assert.equal((await request(dm, { token: outsider.token })).status, 403);
  assert.equal((await request(dm, { token: admin.token, body: { text: " " } })).status, 400);
  const connection = (await request("/connections", { token: admin.token })).data.find(c => c.id === member.user.id);
  assert.equal(connection.headline, "Developer"); assert.equal(connection.skills[0].name, "React");
  const team = (await request("/teams", { token: admin.token, body: { name: "Hackers", hackathonName: "Hack Day", description: "Build things", openSlots: 1 } })).data;
  assert.equal((await request(`/teams/${team._id}/invite`, { token: outsider.token, body: { userId: member.user.id } })).status, 403);
  const invite = await request(`/teams/${team._id}/invite`, { token: admin.token, body: { userId: member.user.id } });
  assert.equal(invite.status, 200, JSON.stringify(invite.data));
  const duplicate = await request(`/teams/${team._id}/invite`, { token: admin.token, body: { userId: member.user.id } });
  assert.equal(duplicate.data._id, invite.data._id);
  assert.equal((await request(`/team-invitations/${invite.data._id}/respond`, { token: outsider.token, body: { action: "accept" } })).status, 404);
  for (let n = 0; n < 2; n++) assert.equal((await request(`/team-invitations/${invite.data._id}/respond`, { token: member.token, body: { action: "accept" } })).status, 200);
  const mine = (await request("/teams/mine", { token: member.token })).data.find(t => t._id === team._id);
  assert.equal(mine.members.length, 2); assert.equal(mine.openSlots, 0); assert.equal(mine.status, "closed");
});

test("email-only configuration starts without a Google client ID", () => { assert.doesNotThrow(() => createApp({ secret, clientId: "" })); });

test("team join requests are private, deduplicated and atomically fill the last slot", async t => {
  // Separate rate-limit window: this workflow should not inherit the auth suite's request quota.
  const isolated = createApp({ secret, clientId: "", matchProviders: [] }).listen(0);
  await new Promise(resolve => isolated.once("listening", resolve));
  t.after(() => new Promise(resolve => isolated.close(resolve)));
  const request = async (path, { token, body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(`http://127.0.0.1:${isolated.address().port}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const register = async name => (await request("/auth/register", { body: { fullName: name, email: `${name}@join.test`, password: "secure-password" } })).data;
  const lead = await register("lead"), first = await register("first"), second = await register("second");
  await Profile.create([lead, first, second].map(u => ({ userId: u.user.id, fullName: u.user.name, skills: [{ name: "React" }], interests: ["Climate"] })));
  const team = await Team.create({ ownerId: lead.user.id, creatorId: lead.user.id, name: "Last slot", event: "Hack", description: "Build", openSlots: 1, members: [{ userId: lead.user.id, role: "Lead" }] });
  assert.equal((await request(`/teams/${team._id}/request-join`, { token: lead.token, body: {} })).status, 400);
  for (const u of [first, first, second]) assert.equal((await request(`/teams/${team._id}/request-join`, { token: u.token, body: {} })).status, 200);
  const notices = await Notification.find({ teamId: team._id, type: "team_join_request" }).lean();
  assert.equal(notices.length, 2);
  assert.equal((await request(`/notifications/${notices[0]._id}/respond`, { token: first.token, body: { action: "accept" } })).status, 404);
  const outcomes = await Promise.all(notices.map(n => request(`/notifications/${n._id}/respond`, { token: lead.token, body: { action: "accept" } })));
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
  const saved = await Team.findById(team._id);
  assert.equal(saved.members.length, 2); assert.equal(saved.openSlots, 0);
  assert.equal(await Notification.countDocuments({ teamId: team._id, type: "team_join_result" }), 1);
  const roster = await request(`/teams/${team._id}/roster`);
  assert.equal(roster.status, 200); assert.equal(roster.data.members.length, 2);
  assert.equal(roster.data.members.filter(m => m.lead).length, 1);
  assert.ok(roster.data.members.every(m => m.profileId && !m.email));
  const accepted = await Notification.findOne({ teamId: team._id, type: "team_join_request", status: "accepted" });
  assert.equal((await request(`/notifications/${accepted._id}/respond`, { token: lead.token, body: { action: "accept" } })).status, 200);
  const communities = require("../models/Community");
  const c = await communities.create({ name: "Climate builders", creatorId: lead.user.id, members: [lead.user.id], tags: ["React", "Climate"] });
  const suggestions = await request("/communities/suggestions", { token: first.token });
  assert.equal(suggestions.status, 200); assert.ok(suggestions.data.some(s => String(s.communityId) === String(c._id)));
});
