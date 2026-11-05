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
    required: true,
  },
  type: {
    type: String,
    enum: ["invitation", "accepted", "rejected"],
    required: true,
  },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ invitationId: 1, type: 1 }, { unique: true });
module.exports = mongoose.model("Notification", schema);
