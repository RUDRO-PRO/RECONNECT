const mongoose = require("mongoose");
module.exports = mongoose.model("Community", new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 2000 },
  domain: { type: String, default: "", maxlength: 60 },
  tags: { type: [String], default: [] },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  inviteCode: { type: String, unique: true, required: true, default: () => require("node:crypto").randomBytes(9).toString("base64url") },
  createdAt: { type: Date, default: Date.now },
}));
