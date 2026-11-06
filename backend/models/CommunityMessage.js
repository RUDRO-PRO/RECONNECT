const mongoose = require("mongoose");
const schema = new mongoose.Schema({communityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community", required: true }, senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, text: { type: String, default: "", maxlength: 5000 }, imageUrl: { type: String, default: "", maxlength: 1200000 }, createdAt: { type: Date, default: Date.now } });
schema.index({ communityId: 1, createdAt: -1 });
module.exports = mongoose.model("CommunityMessage", schema);
