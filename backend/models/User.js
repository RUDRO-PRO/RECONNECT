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
  isVerified: { type: Boolean, default: false },
  verificationOtpHash: { type: String, select: false },
  verificationOtpExpires: { type: Date, select: false },
  verificationOtpSentAt: { type: Date, select: false },
  verificationOtpAttempts: { type: Number, default: 0, select: false },
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
// Hydration preserves legacy accounts without treating new local accounts as verified.
schema.pre("init", function(data) { if (data.isVerified === undefined || data.authProvider === "google") data.isVerified = true; });
schema.pre("save", function() { if (this.authProvider === "google") this.isVerified = true; });
module.exports = mongoose.model("User", schema);
