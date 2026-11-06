const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
  },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  avatar: { type: String, default: "" },
  authProvider: { type: String, enum: ["google", "local"], default: "google" },
  password: { type: String, select: false },
  resetOtp: { type: String, select: false },
  resetOtpExpires: { type: Date, select: false },
  resetOtpAttempts: { type: Number, default: 0, select: false },
  resetOtpSentAt: { type: Date, select: false },
  tokenVersion: { type: Number, default: 0 },
  savedTeams: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Team" }],
    select: false,
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model("User", schema);
