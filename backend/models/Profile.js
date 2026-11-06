const mongoose = require("mongoose");
const availability = [
  "Open to Hackathons & Dev Groups",
  "Building Solo",
  "Exploring",
];
const skill = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 50 },
    category: { type: String, maxlength: 50, default: "" },
    proficiency: {
      type: String,
      enum: ["", "Learning", "Comfortable", "Advanced"],
      default: "",
    },
  },
  { _id: false },
);
const project = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 3000, default: "" },
    techStack: { type: [String], default: [] },
    liveUrl: { type: String, default: "" },
    repoUrl: { type: String, default: "" },
  },
  { _id: false },
);
module.exports = mongoose.model(
  "Profile",
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
      },
      fullName: { type: String, required: true, trim: true, maxlength: 100 },
      avatar: { type: String, default: "" },
      headline: { type: String, default: "", maxlength: 200 },
      college: {
        institution: { type: String, default: "" },
        degree: { type: String, default: "" },
        department: { type: String, default: "" },
        batchYear: { type: String, default: "" },
      },
      about: { type: String, default: "", maxlength: 5000 },
      skills: { type: [skill], default: [] },
      interests: { type: [String], default: [] },
      projects: { type: [project], default: [] },
      resumeUrl: { type: String, default: "" },
      hackathonAvailability: {
        available: { type: Boolean, default: false },
        domains: { type: [String], default: [] },
        roles: { type: [String], default: [] },
      },
      mentorshipAvailable: { type: Boolean, default: false },
      // Keep the original fields for existing profiles and API clients.
      roleTag: { type: String, default: "", maxlength: 200 },
      proofOfWork: { type: String, default: "", maxlength: 1500 },
      availabilityStatus: {
        type: String,
        enum: availability,
        default: "Exploring",
      },
      githubUrl: { type: String, default: "" },
      portfolioUrl: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);
module.exports.availability = availability;
