const mongoose = require("mongoose");

const snippetVersionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const snippetSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Snippet",
      maxlength: 180,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      default: "javascript",
      maxlength: 60,
    },
    versions: {
      type: [snippetVersionSchema],
      default: [],
      validate: {
        validator: (versions) => Array.isArray(versions) && versions.length > 0,
        message: "At least one snippet version is required.",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

snippetSchema.index({ updatedAt: -1 });

snippetSchema.methods.getLatestVersion = function getLatestVersion() {
  return this.versions[this.versions.length - 1] || null;
};

module.exports = mongoose.model("Snippet", snippetSchema);
