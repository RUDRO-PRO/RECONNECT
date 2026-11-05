const mongoose = require("mongoose");
const availability = [
  "Open to Hackathons & Dev Groups",
  "Building Solo",
  "Exploring",
];
module.exports = mongoose.model(
  "Profile",
  new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    roleTag: { type: String, required: true, trim: true, maxlength: 100 },
    skills: { type: [String], required: true },
    proofOfWork: { type: String, required: true, trim: true, maxlength: 1500 },
    availabilityStatus: { type: String, enum: availability, required: true },
    githubUrl: { type: String, default: "" },
    portfolioUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  }),
);
module.exports.availability = availability;
