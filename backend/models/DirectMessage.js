const mongoose = require("mongoose");
const schema = new mongoose.Schema({conversationKey: { type: String, required: true }, senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, text: { type: String, required: true, maxlength: 5000 }, read: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } });
schema.index({ conversationKey: 1, createdAt: -1 });
module.exports = mongoose.model("DirectMessage", schema);
