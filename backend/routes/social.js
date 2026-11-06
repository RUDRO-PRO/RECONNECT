const mongoose = require("mongoose");
const Community = require("../models/Community");
const CommunityMessage = require("../models/CommunityMessage");
const DirectMessage = require("../models/DirectMessage");
const Invitation = require("../models/Invitation");
const Notification = require("../models/Notification");
const Profile = require("../models/Profile");
const User = require("../models/User");
const Team = require("../models/Team");
const { text, bad } = require("../validation");
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const id = value => { if (!/^[a-f\d]{24}$/i.test(value || "")) bad("Invalid ID."); return value; };
const pair = (a, b) => [String(a), String(b)].sort().join(":");
async function connected(a, b) {
  if (!await Invitation.exists({ pairKey: pair(a, b), status: "accepted" })) fail(403, "Connect with this builder before messaging or inviting them to a team.");
}
async function room(req) {
  const c = await Community.findById(id(req.params.id));
  if (!c) fail(404, "Community not found.");
  if (!c.members.some(m => String(m) === String(req.user._id))) fail(403, "Join this community to enter the room.");
  return c;
}
async function connections(userId) {
  const accepted = await Invitation.find({ status: "accepted", $or: [{ senderId: userId }, { receiverId: userId }] }).lean();
  const ids = accepted.map(i => String(i.senderId) === String(userId) ? i.receiverId : i.senderId);
  const [users, profiles] = await Promise.all([User.find({ _id: { $in: ids } }).select("name email avatar").lean(), Profile.find({ userId: { $in: ids } }).select("userId headline skills").lean()]);
  return users.map(u => { const p = profiles.find(p => String(p.userId) === String(u._id)); return { id: String(u._id), name: u.name, email: u.email, avatar: u.avatar, headline: p?.headline || "", skills: p?.skills || [] }; });
}
function installSocial(app, auth) {
  app.use(["/api/messages", "/api/connections"], auth);
  app.get("/api/connections", route(async (req, res) => res.json(await connections(req.user._id))));
  app.get("/api/messages/conversations", route(async (req, res) => {
    const people = await connections(req.user._id);
    res.set("Cache-Control", "no-store").json(await Promise.all(people.map(async p => {
      const conversationKey = pair(req.user._id, p.id);
      const [latest, unread] = await Promise.all([DirectMessage.findOne({ conversationKey }).sort({ createdAt: -1, _id: -1 }).lean(), DirectMessage.countDocuments({ conversationKey, recipientId: req.user._id, read: false })]);
      return { ...p, latestMessage: latest?.text || "", updatedAt: latest?.createdAt, unread };
    })));
  }));
  app.get("/api/messages/:otherUserId", route(async (req, res) => {
    const other = id(req.params.otherUserId); await connected(req.user._id, other);
    const messages = await DirectMessage.find({ conversationKey: pair(req.user._id, other) }).sort({ createdAt: -1, _id: -1 }).limit(200).lean();
    await DirectMessage.updateMany({ _id: { $in: messages.map(m => m._id) }, recipientId: req.user._id, read: false }, { $set: { read: true } });
    res.set("Cache-Control", "no-store").json(messages.reverse());
  }));
  app.post("/api/messages/:otherUserId", route(async (req, res) => {
    const other = id(req.params.otherUserId); await connected(req.user._id, other);
    res.status(201).json(await DirectMessage.create({ conversationKey: pair(req.user._id, other), senderId: req.user._id, recipientId: other, text: text(req.body.text, "Message", 5000, true) }));
  }));
  app.get("/api/communities/:id", auth, route(async (req, res) => {
    const c = await room(req);
    await c.populate([{ path: "creatorId", select: "name email avatar" }, { path: "members", select: "name email avatar" }]);
    const profiles = await Profile.find({ userId: { $in: c.members.map(m => m._id) } }).select("userId headline roleTag").lean();
    const result = c.toObject();
    result.members = result.members.map(m => ({ ...m, roleTag: profiles.find(p => String(p.userId) === String(m._id))?.headline || "" }));
    res.set("Cache-Control", "no-store").json(result);
  }));
  app.get("/api/communities/:id/messages", auth, route(async (req, res) => {
    await room(req);
    const messages = await CommunityMessage.find({ communityId: req.params.id }).sort({ createdAt: -1, _id: -1 }).limit(200).populate("senderId", "name avatar").lean();
    res.set("Cache-Control", "no-store").json(messages.reverse());
  }));
  app.post("/api/communities/:id/messages", auth, route(async (req, res) => {
    await room(req);
    const message = text(req.body.text, "Message", 5000);
    const imageUrl = text(req.body.imageUrl, "Image", 1200000);
    if (imageUrl && !/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageUrl)) bad("Attach a compressed JPEG or WebP image.");
    if (!message && !imageUrl) bad("Write a message or attach an image.");
    const saved = await CommunityMessage.create({ communityId: req.params.id, senderId: req.user._id, text: message, imageUrl });
    await saved.populate("senderId", "name avatar");
    res.status(201).json(saved);
  }));
  app.post("/api/communities/:id/add-member", auth, route(async (req, res) => {
    await room(req); const memberId = id(req.body.userId);
    if (!await User.exists({ _id: memberId })) fail(404, "Builder not found.");
    await Community.updateOne({ _id: req.params.id, members: req.user._id }, { $addToSet: { members: memberId } });
    res.json({ success: true });
  }));
  app.delete("/api/communities/:id/members/:memberId", auth, route(async (req, res) => {
    const c = await room(req); const memberId = id(req.params.memberId);
    if (String(c.creatorId) !== String(req.user._id)) fail(403, "Only the community admin can remove members.");
    if (memberId === String(c.creatorId)) bad("The community admin cannot be removed.");
    await Community.updateOne({ _id: c._id }, { $pull: { members: memberId } });
    res.json({ success: true });
  }));
  app.get("/api/teams/:id/invites", auth, route(async (req, res) => {
    const t = await Team.findById(id(req.params.id));
    if (!t || String(t.creatorId || t.ownerId) !== String(req.user._id)) fail(403, "Only the team creator can invite connections.");
    res.json(await Notification.find({ teamId: t._id, type: "team_invite" }).select("recipientId status").lean());
  }));
  app.post("/api/teams/:id/invite", auth, route(async (req, res) => {
    const t = await Team.findById(id(req.params.id));
    if (!t || String(t.creatorId || t.ownerId) !== String(req.user._id)) fail(403, "Only the team creator can invite connections.");
    if (t.status !== "open") bad("This team is closed.");
    const receiver = id(req.body.userId); await connected(req.user._id, receiver);
    if (t.members.some(m => String(m.userId) === receiver)) bad("This builder is already a team member.");
    const notice = await Notification.findOneAndUpdate({ teamId: t._id, recipientId: receiver }, { $setOnInsert: { senderId: req.user._id, type: "team_invite", status: "pending", message: `${req.user.name} invited you to join ${t.name}.` } }, { upsert: true, returnDocument: "after", runValidators: true });
    res.json(notice);
  }));
  app.post("/api/team-invitations/:id/respond", auth, route(async (req, res) => {
    id(req.params.id);
    if (!["accept", "decline"].includes(req.body.action)) bad("Choose accept or decline.");
    await mongoose.connection.transaction(async session => {
      const n = await Notification.findOne({ _id: req.params.id, recipientId: req.user._id, type: "team_invite" }).session(session);
      if (!n) fail(404, "Invitation not found.");
      if (n.status !== "pending") return;
      if (req.body.action === "accept") {
        const t = await Team.findById(n.teamId).session(session);
        if (!t || t.status !== "open") fail(409, "This team is no longer accepting members.");
        if (!t.members.some(m => String(m.userId) === String(req.user._id))) {
          if (t.openSlots < 1) fail(409, "This team is full.");
          t.members.push({ userId: req.user._id, role: "Member" }); t.openSlots -= 1;
          if (!t.openSlots) t.status = "closed";
          await t.save({ session });
        }
      }
      n.status = req.body.action === "accept" ? "accepted" : "declined"; n.read = true; await n.save({ session });
    });
    res.json({ success: true });
  }));
}
module.exports = { installSocial };
