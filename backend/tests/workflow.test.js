const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { createApp } = require("../server");
const User = require("../models/User");
const Profile = require("../models/Profile");
const Invitation = require("../models/Invitation");
const Notification = require("../models/Notification");
const secret = "integration-test-secret-with-at-least-32-characters";
let replica, server, base;
let matchResponse = [],
  matchFailure = false;
const ai = {
  models: {
    async generateContent() {
      if (matchFailure) throw new Error("Provider unavailable");
      return { text: JSON.stringify(matchResponse) };
    },
  },
};
const identities = {
  a: {
    sub: "google-a",
    email: "a@example.test",
    name: "Builder A",
    email_verified: true,
  },
  b: {
    sub: "google-b",
    email: "b@example.test",
    name: "Builder B",
    email_verified: true,
  },
  c: {
    sub: "google-c",
    email: "c@example.test",
    name: "Builder C",
    email_verified: true,
  },
};
const googleClient = {
  async verifyIdToken({ idToken, audience }) {
    assert.equal(audience, "test-client");
    if (!identities[idToken]) throw new Error("Invalid token");
    return { getPayload: () => identities[idToken] };
  },
};
async function request(
  path,
  { token, body, method = body ? "POST" : "GET" } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const input = (name) => ({
  fullName: name,
  roleTag: "Backend engineer",
  skills: ["C++", "Go"],
  proofOfWork: "A real project description",
  availabilityStatus: "Open to Hackathons & Dev Groups",
  githubUrl: "https://github.com/example",
  portfolioUrl: "",
});
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri());
  await Promise.all([
    User.init(),
    Profile.init(),
    Invitation.init(),
    Notification.init(),
  ]);
  server = createApp({
    secret,
    clientId: "test-client",
    googleClient,
    ai,
    geminiApiKey: "test-key",
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replica) await replica.stop();
});
test("real MongoDB workflow, identity boundaries, and atomic invitations", async () => {
  assert.deepEqual((await request("/profiles")).data, []);
  assert.equal(
    (await request("/profiles", { body: input("Unauthorized") })).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/google", {
        body: { email: "forged@example.test", googleId: "fake" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/auth/google", { body: { credential: "forged" } })).status,
    401,
  );
  const a = (await request("/auth/google", { body: { credential: "a" } })).data;
  const b = (await request("/auth/google", { body: { credential: "b" } })).data;
  const c = (await request("/auth/google", { body: { credential: "c" } })).data;
  const again = (await request("/auth/google", { body: { credential: "a" } }))
    .data;
  assert.equal(again.user.id, a.user.id);
  assert.equal(await User.countDocuments(), 3);
  const expired = jwt.sign({}, secret, {
    subject: a.user.id,
    expiresIn: -1,
    issuer: "talentbridge",
    audience: "talentbridge-web",
  });
  assert.equal((await request("/auth/me", { token: expired })).status, 401);
  assert.equal(
    (
      await request("/profiles", {
        token: a.token,
        body: { ...input("A"), githubUrl: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/profiles", {
        token: a.token,
        body: { ...input("A"), skills: [] },
      })
    ).status,
    400,
  );
  const pa = await request("/profiles", {
    token: a.token,
    body: { ...input("A"), userId: b.user.id },
  });
  assert.equal(pa.status, 200);
  assert.equal(pa.data.userId, a.user.id);
  await request("/profiles", { token: a.token, body: input("A updated") });
  assert.equal(await Profile.countDocuments(), 1);
  assert.equal(
    (await request("/match", { token: a.token, body: {} })).data.length,
    0,
  );
  await request("/profiles", {
    token: b.token,
    body: {
      ...input("B"),
      skills: ["React", "CSS"],
      roleTag: "Frontend engineer",
    },
  });
  const pb = await Profile.findOne({ userId: b.user.id });
  matchResponse = [
    { id: "invented", reason: "Not real" },
    { id: String(pb._id), reason: "Frontend skills complement backend work" },
    { id: String(pb._id), reason: "Duplicate" },
  ];
  const matches = await request("/match", {
    token: a.token,
    body: { skills: ["ignored client input"] },
  });
  assert.equal(matches.status, 200);
  assert.equal(matches.data.length, 1);
  assert.equal(matches.data[0].userId, b.user.id);
  matchFailure = true;
  assert.equal(
    (await request("/match", { token: a.token, body: {} })).status,
    502,
  );
  matchFailure = false;
  await request("/profiles", {
    token: b.token,
    body: { ...input("B"), availabilityStatus: "Building Solo" },
  });
  assert.deepEqual(
    (await request("/match", { token: a.token, body: {} })).data,
    [],
  );
  await request("/profiles", {
    token: b.token,
    body: {
      ...input("B"),
      skills: ["React", "CSS"],
      roleTag: "Frontend engineer",
    },
  });
  assert.equal((await request("/profiles?search=C%2B%2B")).data.length, 1);
  assert.equal((await request("/profiles?search=%5B")).status, 200);
  assert.equal(
    (
      await request("/invitations", {
        token: a.token,
        body: { receiverId: a.user.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/invitations", {
        token: c.token,
        body: { receiverId: a.user.id },
      })
    ).status,
    400,
  );
  assert.equal(await Invitation.countDocuments(), 0);
  assert.equal(await Notification.countDocuments(), 0);
  const invites = await Promise.all([
    request("/invitations", {
      token: a.token,
      body: { receiverId: b.user.id },
    }),
    request("/invitations", {
      token: a.token,
      body: { receiverId: b.user.id },
    }),
  ]);
  assert.deepEqual(invites.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Invitation.countDocuments(), 1);
  assert.equal(await Notification.countDocuments(), 1);
  assert.equal(
    (
      await request("/invitations", {
        token: b.token,
        body: { receiverId: a.user.id },
      })
    ).status,
    409,
  );
  assert.deepEqual(
    (await request("/connections", { token: a.token })).data,
    [],
  );
  assert.deepEqual(
    (await request("/notifications", { token: c.token })).data,
    [],
  );
  const notice = (await request("/notifications", { token: b.token })).data[0];
  assert.equal(notice.read, false);
  assert.equal(notice.senderId.name, "Builder A");
  assert.equal(notice.senderId.email, undefined);
  assert.equal(
    (
      await request(`/notifications/${notice._id}/respond`, {
        token: c.token,
        body: { action: "accept" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/notifications/${notice._id}/respond`, {
        token: b.token,
        body: { action: "bogus" },
      })
    ).status,
    400,
  );
  await request("/notifications/read", {
    token: c.token,
    body: { ids: [notice._id] },
  });
  assert.equal((await Notification.findById(notice._id)).read, false);
  assert.equal(
    (
      await request(`/notifications/${notice._id}/respond`, {
        token: b.token,
        body: { action: "accept" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/notifications/${notice._id}/respond`, {
        token: b.token,
        body: { action: "decline" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/connections", { token: a.token })).data[0].email,
    b.user.email,
  );
  assert.equal(
    (await request("/connections", { token: b.token })).data[0].email,
    a.user.email,
  );
  assert.deepEqual(
    (await request("/connections", { token: c.token })).data,
    [],
  );
  const answer = (await request("/notifications", { token: a.token })).data[0];
  assert.equal(answer.type, "accepted");
  assert.equal(answer.read, false);
  await request("/notifications/read", {
    token: a.token,
    body: { ids: [answer._id] },
  });
  assert.equal((await Notification.findById(answer._id)).read, true);
  await request("/profiles", { token: c.token, body: input("C") });
  await request("/invitations", {
    token: c.token,
    body: { receiverId: b.user.id },
  });
  const declined = (
    await request("/notifications", { token: b.token })
  ).data.find((n) => n.invitationId.status === "pending");
  assert.equal(
    (
      await request(`/notifications/${declined._id}/respond`, {
        token: b.token,
        body: { action: "decline" },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await request("/connections", { token: c.token })).data,
    [],
  );
  // The directory contains only persisted profiles, and never exposes account emails.
  const directory = (await request("/profiles")).data;
  assert.equal(directory.length, 3);
  assert.ok(directory.every((p) => !p.email));
  await mongoose.disconnect();
  assert.equal((await request("/profiles")).status, 503);
});
