const Team = require('../models/Team');
const TeamMessage = require('../models/TeamMessage');
const User = require('../models/User');
const { text, url, bad } = require('../validation');
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const validId = value => { if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) bad('Invalid ID.'); return value; };
const states = ['Ideation', 'Architecture & Design', 'Building MVP', 'Testing & Polish', 'Pitch Ready'];
function assetUrl(value) {
  const result = text(value, 'Attachment', 1200000);
  if (result.startsWith('data:')) {
    if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(result)) bad('Choose a PNG, JPEG, WebP or GIF image.');
    return result;
  }
  return url(result, 'Asset URL');
}
function memberFilter(req) { return { _id: validId(req.params.teamId), $or: [{ ownerId: req.user._id }, { creatorId: req.user._id }, { 'members.userId': req.user._id }] }; }
async function member(req) {
  const team = await Team.findOne(memberFilter(req)).select('+milestones +assets').lean();
  if (!team) fail(403, 'Only team members can access this workspace.');
  return team;
}
function installTeamWorkspace(app, auth) {
  app.get('/api/teams/:teamId/workspace', auth, route(async (req, res) => {
    const team = await member(req);
    const members = [...(team.members || [])];
    for (const lead of [team.ownerId, team.creatorId].filter(Boolean)) if (!members.some(m => String(m.userId) === String(lead))) members.unshift({ userId: lead, role: 'Lead' });
    const [users, messages] = await Promise.all([
      User.find({ _id: { $in: members.map(m => m.userId) } }).select('name avatar').lean(),
      TeamMessage.find({ teamId: team._id }).sort({ createdAt: -1, _id: -1 }).limit(200).lean(),
    ]);
    res.set('Cache-Control', 'no-store').json({ ...team, projectState: team.projectState || states[0], progressPercent: team.progressPercent || 0,
      members: members.map(m => ({ ...m, ...users.find(u => String(u._id) === String(m.userId)) })), messages: messages.reverse() });
  }));
  app.post('/api/teams/:teamId/messages', auth, route(async (req, res) => {
    await member(req);
    const message = text(req.body.text, 'Message', 5000), attachmentUrl = assetUrl(req.body.attachmentUrl);
    if (!message && !attachmentUrl) bad('Write a message or attach an image.');
    const saved = await TeamMessage.create({ teamId: req.params.teamId, senderId: req.user._id, senderName: req.user.name, senderAvatar: req.user.avatar,
      text: message, attachmentUrl, clientMessageId: text(req.body.clientMessageId, 'Client message ID', 100) });
    res.status(201).json(saved);
  }));
  app.patch('/api/teams/:teamId/progress', auth, route(async (req, res) => {
    await member(req);
    const body = req.body, set = {}, update = {};
    if (body.projectState !== undefined) { if (!states.includes(body.projectState)) bad('Choose a valid project stage.'); set.projectState = body.projectState; }
    if (body.progressPercent !== undefined) { if (typeof body.progressPercent !== 'number' || !Number.isFinite(body.progressPercent) || body.progressPercent < 0 || body.progressPercent > 100) bad('Progress must be between 0 and 100.'); set.progressPercent = body.progressPercent; }
    if (body.currentSprintGoal !== undefined) set.currentSprintGoal = text(body.currentSprintGoal, 'Sprint goal', 1000);
    const filter = memberFilter(req);
    if (body.milestone) {
      if (body.milestone._id) {
        filter['milestones._id'] = validId(body.milestone._id);
        if (typeof body.milestone.completed !== 'boolean') bad('Milestone completion must be true or false.');
        set['milestones.$.completed'] = body.milestone.completed; set['milestones.$.updatedAt'] = new Date();
      } else {
        filter['milestones.199'] = { $exists: false };
        update.$push = { milestones: { title: text(body.milestone.title, 'Milestone', 200, true), assigneeName: text(body.milestone.assigneeName, 'Assignee', 100), completed: false, updatedAt: new Date() } };
      }
    }
    if (Object.keys(set).length) update.$set = set;
    if (!Object.keys(update).length) bad('Provide a progress update.');
    const result = await Team.updateOne(filter, update, { runValidators: true });
    if (!result.matchedCount) fail(409, 'Milestone unavailable or task limit reached. Refresh the workspace.');
    res.json({ success: true });
  }));
  app.post('/api/teams/:teamId/assets', auth, route(async (req, res) => {
    await member(req);
    const imageUrl = assetUrl(req.body.imageUrl);
    if (!imageUrl) bad('Attach an image or provide an asset URL.');
    const asset = { title: text(req.body.title, 'Title', 150, true), caption: text(req.body.caption, 'Caption', 1000), imageUrl, uploadedBy: req.user._id, uploadedByName: req.user.name, createdAt: new Date() };
    // Keep embedded image storage comfortably below MongoDB's document limit.
    const result = await Team.updateOne({ ...memberFilter(req), 'assets.7': { $exists: false } }, { $push: { assets: asset } }, { runValidators: true });
    if (!result.matchedCount) fail(409, 'This team has eight assets. Remove one before adding another.');
    res.status(201).json({ success: true });
  }));
  app.delete('/api/teams/:teamId/assets/:assetId', auth, route(async (req, res) => {
    await member(req);
    const result = await Team.updateOne({ ...memberFilter(req), 'assets._id': validId(req.params.assetId) }, { $pull: { assets: { _id: req.params.assetId } } });
    if (!result.matchedCount) fail(404, 'Asset not found.');
    res.json({ success: true });
  }));
}
module.exports = { installTeamWorkspace, assetUrl };
