const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const Community = require("../models/Community");
const Profile = require("../models/Profile");
const Notification = require("../models/Notification");
const { text, list, bad } = require("../validation");
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const terms = profile => [...(profile?.skills || []).map(s => typeof s === "string" ? s : s.name), ...(profile?.interests || [])];
const key = value => value.trim().toLowerCase();
const publicCommunity = (c, user) => ({ _id: c._id, name: c.name, description: c.description, domain: c.domain, tags: c.tags, creatorId: c.creatorId, inviteCode: c.inviteCode, createdAt: c.createdAt, memberCount: c.members.length, joined: c.members.some(id => String(id) === String(user?._id)) });
function installCommunities(app, auth, matchOptions = {}) {
  const optionalAuth = (req, res, next) => req.headers.authorization ? auth(req, res, next) : next();
  const suggestions = new Map();
  app.get("/api/communities/suggestions", auth, route(async (req, res) => {
    const userId = String(req.user._id), cached = suggestions.get(userId);
    if (cached && cached.until > Date.now()) return res.json(cached.value);
    const profile = await Profile.findOne({ userId: req.user._id }).lean();
    if (!profile) return res.json([]);
    const ownTerms = terms(profile).map(key);
    const communities = await Community.find({ members: { $ne: req.user._id } }).limit(100).lean();
    const eligible = communities.filter(c => [...c.tags, c.domain].some(t => ownTerms.includes(key(t))));
    const ranked = await require("../utils/aiMatchmaker").rankComplementaryBuilders(profile, eligible.map(c => ({ _id: c._id, skills: c.tags, interests: [...c.tags, c.domain] })), matchOptions);
    const value = ranked.map(r => ({ communityId: r._id, reason: r.matchReason }));
    if (suggestions.size >= 1000) suggestions.delete(suggestions.keys().next().value);
    suggestions.set(userId, { value, until: Date.now() + 300000 });
    res.json(value);
  }));
  app.get("/api/communities", optionalAuth, route(async (req, res) => {
    const communities = await Community.find().sort({ createdAt: -1 }).lean();
    res.set("Cache-Control", "no-store").json(communities.map(c => publicCommunity(c, req.user)));
  }));
  app.post("/api/communities", auth, rateLimit({ windowMs: 3600000, limit: 5, keyGenerator: req => String(req.user._id), message: { message: "Please wait before creating another community." } }), route(async (req, res) => {
    const input = { name: text(req.body.name, "Community name", 100, true), description: text(req.body.description, "Description", 2000), domain: text(req.body.domain, "Domain", 60), tags: list(req.body.tags, "Tags") };
    let community;
    await mongoose.connection.transaction(async session => {
      const creator = await Profile.findOne({ userId: req.user._id }).session(session).lean();
      const matchingTerms = [...new Set([...terms(creator), ...input.tags, input.domain].filter(Boolean).map(key))];
      const exact = matchingTerms.map(t => new RegExp("^" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"));
      const profiles = exact.length ? await Profile.find({ userId: { $ne: req.user._id }, $or: [{ "skills.name": { $in: exact } }, { skills: { $in: exact } }, { interests: { $in: exact } }] }).session(session).lean() : [];
      [community] = await Community.create([{ ...input, creatorId: req.user._id, members: [req.user._id] }], { session });
      const recipients = new Set();
      const notifications = profiles.flatMap(p => {
        const matched = [...new Set(terms(p).filter(t => matchingTerms.includes(key(t))))];
        if (!matched.length || recipients.has(String(p.userId))) return [];
        recipients.add(String(p.userId));
        return [{ recipientId: p.userId, senderId: req.user._id, type: "community", communityId: community._id, inviteCode: community.inviteCode,
          message: `${req.user.name} created the '${community.name}' community matching your ${matched.slice(0, 5).join(", ")} profile. Connect and collaborate with like-minded builders.` }];
      });
      if (notifications.length) await Notification.insertMany(notifications, { session });
    });
    res.status(201).json(publicCommunity(community, req.user));
  }));
  app.post("/api/communities/:inviteCode/join", auth, route(async (req, res) => {
    if (!/^[A-Za-z0-9_-]{12}$/.test(req.params.inviteCode)) bad("Invalid community invitation.");
    const community = await Community.findOneAndUpdate({ inviteCode: req.params.inviteCode }, { $addToSet: { members: req.user._id } }, { returnDocument: "after" });
    if (!community) return res.status(404).json({ message: "This community invitation is no longer available." });
    await Notification.updateMany({ recipientId: req.user._id, communityId: community._id }, { $set: { read: true } });
    res.json(publicCommunity(community, req.user));
  }));
}
module.exports = { installCommunities };
