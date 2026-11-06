const mongoose = require("mongoose");
module.exports = mongoose.model(
  "Team",
  new mongoose.Schema(
    {
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
