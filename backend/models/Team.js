const mongoose = require("mongoose");
module.exports = mongoose.model(
  "Team",
  new mongoose.Schema(
    {
      projectState: { type: String, enum: ['Ideation', 'Architecture & Design', 'Building MVP', 'Testing & Polish', 'Pitch Ready'], default: 'Ideation' },
      progressPercent: { type: Number, min: 0, max: 100, default: 0 },
      currentSprintGoal: { type: String, maxlength: 1000, default: '' },
      milestones: { type: [{ title: { type: String, maxlength: 200 }, completed: { type: Boolean, default: false }, assigneeName: { type: String, maxlength: 100 }, updatedAt: { type: Date, default: Date.now } }], default: [], select: false },
      assets: { type: [{ title: String, caption: String, imageUrl: String, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, uploadedByName: String, createdAt: { type: Date, default: Date.now } }], default: [], select: false },
      creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      hackathonName: String,
      neededRoles: { type: [String], default: [] },
      techStack: { type: [String], default: [] },
      members: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, role: String, joinedAt: { type: Date, default: Date.now } }],
      inviteCode: { type: String, unique: true, sparse: true, default: () => require("node:crypto").randomBytes(9).toString("base64url") },
      ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      name: { type: String, required: true, maxlength: 100 },
      event: { type: String, required: true, maxlength: 150 },
      description: { type: String, required: true, maxlength: 2000 },
      domains: { type: [String], default: [] },
      skillsNeeded: { type: [String], default: [] },
      openSlots: { type: Number, required: true, min: 0, max: 20 },
      eventUrl: { type: String, default: "" },
      eventDate: { type: String, default: "" },
      status: { type: String, enum: ["open", "closed"], default: "open" },
    },
    { timestamps: true },
  ),
);

module.exports.schema.index({ status: 1, createdAt: -1, _id: -1 });
module.exports.schema.index({ ownerId: 1, createdAt: -1 });
module.exports.schema.index({ creatorId: 1, createdAt: -1 });
module.exports.schema.index({ 'members.userId': 1, createdAt: -1 });
