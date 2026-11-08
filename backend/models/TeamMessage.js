const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: String, senderAvatar: String,
  text: { type: String, maxlength: 5000 }, attachmentUrl: String,
  clientMessageId: { type: String, maxlength: 100 },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ teamId: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('TeamMessage', schema);
