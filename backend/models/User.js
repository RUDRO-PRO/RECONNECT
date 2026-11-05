const mongoose = require("mongoose");
module.exports = mongoose.model(
  "User",
  new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true },
    name: { type: String, required: true },
    avatar: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  }),
);
