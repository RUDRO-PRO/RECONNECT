const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  invitationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invitation",
    required: function () { return ["invitation", "accepted", "rejected"].includes(this.type); },
  },
  type: {
    type: String,
    enum: ["invitation", "accepted", "rejected", "community", "team_invite", "team_join_request", "team_join_result"],
    required: true,
  },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
  status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  note: { type: String, maxlength: 1000 },
  communityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community" },
  inviteCode: String,
  message: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ invitationId: 1, type: 1 }, { unique: true, partialFilterExpression: { invitationId: { $type: "objectId" } } });
schema.index({ communityId: 1, recipientId: 1 }, { unique: true, partialFilterExpression: { communityId: { $type: "objectId" } } });
schema.index({ teamId: 1, recipientId: 1, senderId: 1, type: 1 }, { unique: true, partialFilterExpression: { teamId: { $type: "objectId" } } });
module.exports = mongoose.model("Notification", schema);
