const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { installAuth, publicUser } = require("./routes/auth");
const { installProfiles } = require("./routes/profiles");
const Team = require("./models/Team");

const { rateLimit } = require("express-rate-limit");
const User = require("./models/User");
const Profile = require("./models/Profile");
const Invitation = require("./models/Invitation");
const Notification = require("./models/Notification");
const { normalizeProfile, bad, text } = require("./validation");
mongoose.set("bufferCommands", false);
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const configured = (value) => Boolean(value && !/your_|<|>/.test(value));
const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function createApp(options = {}) {
  const app = express();
  const clientId = require("./config").googleClientId(options.clientId);
  const geminiApiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY;

  app.disable("x-powered-by");
  if (process.env.VERCEL) app.set("trust proxy", 1);
  app.use(
    cors(require("./config").corsOptions()),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { message: "Too many requests. Try again shortly." },
    }),
  );
  const publicLinks = Object.fromEntries(
    ["github", "linkedin", "twitter", "discord"].map((key) => {
      const value = process.env["PUBLIC_" + key.toUpperCase() + "_URL"];
      try {
        const parsed = new URL(value);
        return [
          key,
          parsed.protocol === "https:" && !parsed.username && !parsed.password
            ? parsed.href
            : null,
        ];
      } catch {
        return [key, ({ github: "https://github.com/RUDRO-PRO/TALENTBRIDGE", linkedin: "https://www.linkedin.com/in/rudro-chakraborty" })[key] || null];
      }
    }),
  );
  app.get("/api/config", (req, res) =>
    res.set("Cache-Control", "no-store").json({
      googleClientId: clientId,
      links: publicLinks,
    }),
  );
  app.get(
    "/api/health",
    route(async (req, res) => {
      if (options.ensureDatabase) await options.ensureDatabase();
      let database = false;
      if (mongoose.connection.readyState === 1) {
        try {
          await mongoose.connection.db.command(
            { ping: 1 },
            { timeoutMS: 2000 },
          );
          database = true;
        } catch {}
      }
      const services = {
        database: database ? "operational" : "unavailable",
        google: configured(clientId) ? "configured" : "not configured",
        matching: "operational",
        email:
          process.env.SMTP_HOST &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASS &&
          process.env.SMTP_FROM &&
          !/your[-_]|example\./i.test(
            process.env.SMTP_HOST +
              process.env.SMTP_USER +
              process.env.SMTP_FROM,
          )
            ? "configured"
            : "not configured",
      };
      const status = !database
        ? "unavailable"
        : Object.values(services).includes("not configured")
          ? "degraded"
          : "operational";
      res
        .set("Cache-Control", "no-store")
        .status(database ? 200 : 503)
        .json({
          status,
          services,
          checkedAt: new Date().toISOString(),
          note: "Database connectivity is checked live. External integrations report configuration, not provider uptime.",
        });
    }),
  );
  // The serverless adapter supplies a cached connection gate after public config and CORS.
  if (options.ensureDatabase) app.use("/api", route(async (req, res, next) => {
    await options.ensureDatabase();
    next();
  }));
  app.use("/api", (req, res, next) =>
    mongoose.connection.readyState === 1
      ? next()
      : res
          .status(503)
          .json({ message: "Database unavailable. Please try again later." }),
  );
  const { auth } = installAuth(app, options);
  installProfiles(app, auth);
  require("./routes/communities").installCommunities(app, auth, { providers: options.matchProviders });
  require("./routes/social").installSocial(app, auth);
  app.get(
    "/api/invitations",
    auth,
    route(async (req, res) =>
      res.json(
        await Invitation.find({
          $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
        }).lean(),
      ),
    ),
  );
  app.post(
    "/api/invitations",
    auth,
    route(async (req, res) => {
      const note = text(req.body.note, "Connection note", 1000);
      let { receiverId } = req.body;
      if (!validId(receiverId)) bad("Invalid recipient.");
      receiverId = receiverId.toLowerCase();
      if (receiverId === String(req.user._id))
        bad("You cannot invite yourself.");
      const pairKey = [String(req.user._id), receiverId].sort().join(":");
      let invitation;
      await mongoose.connection.transaction(async (session) => {
        const sender = await Profile.exists({ userId: req.user._id }).session(
          session,
        );
        const receiver = await Profile.exists({ userId: receiverId }).session(
          session,
        );
        if (!sender || !receiver)
          bad("Both builders must publish a profile before connecting.");
        if (await Invitation.exists({ pairKey }).session(session))
          fail(409, "An invitation already exists between these builders.");
        [invitation] = await Invitation.create(
          [{ senderId: req.user._id, receiverId, pairKey, note }],
          { session },
        );
        if (note) await require("./models/DirectMessage").create([{ conversationKey: pairKey, senderId: req.user._id, recipientId: receiverId, text: note }], { session });
        await Notification.create(
          [
            {
              recipientId: receiverId,
              senderId: req.user._id,
              invitationId: invitation._id,
              type: "invitation",
              note,
            },
          ],
          { session },
        );
      });
      res.status(201).json(invitation);
    }),
  );
  app.get(
    "/api/notifications",
    auth,
    route(async (req, res) =>
      res.json(
        await Notification.find({ recipientId: req.user._id })
          .sort({ createdAt: -1 })
          .populate("senderId", "name avatar")
          .populate("invitationId", "status")
          .lean(),
      ),
    ),
  );
  app.post(
    "/api/notifications/read",
    auth,
    route(async (req, res) => {
      const ids = req.body.ids;
      if (
        !Array.isArray(ids) ||
        ids.length > 200 ||
        ids.some((id) => !validId(id))
      )
        bad("Invalid notification IDs.");
      await Notification.updateMany(
        { _id: { $in: ids }, recipientId: req.user._id },
        { $set: { read: true } },
      );
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/notifications/:id/respond",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid notification.");
      if (!["accept", "decline"].includes(req.body.action))
        bad("Choose accept or decline.");
      const status = req.body.action === "accept" ? "accepted" : "rejected";
      await mongoose.connection.transaction(async (session) => {
        const notification = await Notification.findOne({
          _id: req.params.id,
          recipientId: req.user._id,
          type: "invitation",
        }).session(session);
        if (!notification) fail(404, "Notification not found.");
        const invitation = await Invitation.findOneAndUpdate(
          {
            _id: notification.invitationId,
            receiverId: req.user._id,
            status: "pending",
          },
          { $set: { status } },
          { returnDocument: "after", session },
        );
        if (!invitation)
          fail(409, "This invitation has already been answered.");
        notification.read = true;
        await notification.save({ session });
        await Notification.create(
          [
            {
              recipientId: invitation.senderId,
              senderId: req.user._id,
              invitationId: invitation._id,
              type: status,
            },
          ],
          { session },
        );
      });
      res.json({ status });
    }),
  );
  app.post(
    "/api/match",
    auth,
    rateLimit({
      windowMs: 60000,
      limit: 5,
      message: { message: "Please wait before matching again." },
    }),
    route(async (req, res) => {
      const profile = normalizeProfile(
        await Profile.findOne({ userId: req.user._id }).lean(),
      );
      if (!profile) bad("Publish your profile before finding teammates.");
      if (!profile.skills.length)
        bad("Add your skills to your profile before finding teammates.");
      const invitations = await Invitation.find({
        $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
      }).lean();
      const excluded = invitations.flatMap((i) => [i.senderId, i.receiverId]);
      const candidateRecords = await Profile.find({
        userId: { $nin: [req.user._id, ...excluded] },
        $or: [
          { "hackathonAvailability.available": true },
          {
            hackathonAvailability: { $exists: false },
            availabilityStatus: Profile.availability[0],
          },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      const candidates = candidateRecords.map(normalizeProfile);
      if (!candidates.length) return res.json([]);
      const { rankComplementaryBuilders } = require("./utils/aiMatchmaker");
      const providers = options.matchProviders ?? require("./config").aiProviders({ ...process.env, ...(options.geminiApiKey !== undefined ? { GEMINI_API_KEY: options.geminiApiKey } : {}) });
      res.json(await rankComplementaryBuilders(profile, candidates, { providers, ai: options.ai }));
    }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
  );
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get(
    [
      "/profile/:id",
      "/teams",
      "/saved-teams",
      "/my-teams",
      "/community/join/:inviteCode",
      "/projects",
      "/communities",
      "/hubs",
      "/calendar",
      "/mentorship",
      "/match",
      "/status",
      "/resources/:page",
      "/legal/:page",
    ],
    (req, res) =>
      res.sendFile(path.join(__dirname, "../frontend/dist/index.html")),
  );
  app.use((error, req, res, next) => {
    const status =
      error.name === "ValidationError" || error.name === "CastError"
        ? 400
        : error.code === 11000
          ? 409
          : error.status || (error.name?.startsWith("Mongo") ? 503 : 500);
    res.status(status).json({
      ...(error.publicCode ? { code: error.publicCode } : {}),
      message: error.status
        ? error.message
        : status === 409
          ? "This record already exists or has already been updated."
          : status === 503
            ? "We’re having trouble connecting. Please try again shortly."
            : status < 500
              ? error.message
              : "Unable to complete the request.",
    });
  });
  return app;
}
async function dropLegacyIndex(collection, name) {
  try { await collection.dropIndex(name); }
  catch (error) { if (![26, 27].includes(error.code)) throw error; }
}
async function initializeDatabase() {
  for (const key of ["MONGODB_URI", "JWT_SECRET"])
    if (!configured(process.env[key]))
      throw new Error(`Configure ${key} in backend/.env.`);
  if (process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw new Error(
      "MongoDB requires a replica set (Atlas supported) for atomic invitations.",
    );
  // The old Google-only schema used a non-sparse unique index. Local accounts
  // have no Google subject, so replace only that index (never user records).
  const indexes = await User.collection.indexes().catch((e) => {
    if (e.code === 26) return [];
    throw e;
  });
  const googleIndex = indexes.find((i) => i.key.googleId === 1 && !i.sparse);
  if (googleIndex) await dropLegacyIndex(User.collection, googleIndex.name);
  const notificationIndexes = await Notification.collection.indexes().catch(e => {
    if (e.code === 26) return [];
    throw e;
  });
  const legacyNotificationIndex = notificationIndexes.find(i => i.key.invitationId === 1 && i.key.type === 1 && !i.partialFilterExpression);
  if (legacyNotificationIndex) await dropLegacyIndex(Notification.collection, legacyNotificationIndex.name);
  const legacyTeamIndex = notificationIndexes.find(i => i.key.teamId === 1 && i.key.recipientId === 1 && !i.key.type);
  if (legacyTeamIndex) await dropLegacyIndex(Notification.collection, legacyTeamIndex.name);
  await Promise.all([
    User.createIndexes(),
    Profile.createIndexes(),
    Invitation.createIndexes(),
    Notification.createIndexes(),
    require("./models/Community").createIndexes(),
    require("./models/CommunityMessage").createIndexes(),
    require("./models/DirectMessage").createIndexes(),
    Team.createIndexes(),
  ]);
}
async function start() {
  await initializeDatabase();
  createApp().listen(process.env.PORT || 5000, () =>
    console.log("Reconnect API ready."),
  );
}
if (require.main === module)
  start().catch((error) => {
    console.error(
      error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[database URI]"),
    );
    process.exit(1);
  });
module.exports = { createApp, start, initializeDatabase, databaseReady: () => mongoose.connection.readyState === 1 };
