const express = require("express");
const Snippet = require("../models/Snippet");

const router = express.Router();

function toClientSnippet(snippetDoc) {
  const snippet = snippetDoc.toObject ? snippetDoc.toObject() : snippetDoc;
  const latestVersion = snippet.versions[snippet.versions.length - 1] || null;

  return {
    ...snippet,
    latestVersion,
  };
}

router.post("/", async (req, res, next) => {
  try {
    const { title, language, code } = req.body;

    if (typeof code !== "string") {
      return res
        .status(400)
        .json({ message: "`code` is required and must be a string." });
    }

    const snippet = await Snippet.create({
      title: typeof title === "string" && title.trim() ? title.trim() : "Untitled Snippet",
      language:
        typeof language === "string" && language.trim()
          ? language.trim().toLowerCase()
          : "javascript",
      versions: [{ code, timestamp: new Date() }],
    });

    return res.status(201).json(toClientSnippet(snippet));
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const snippets = await Snippet.find(
      {},
      {
        title: 1,
        language: 1,
        createdAt: 1,
        updatedAt: 1,
        versions: { $slice: -1 },
      }
    )
      .sort({ updatedAt: -1 })
      .lean();

    const payload = snippets.map((snippet) => ({
      _id: snippet._id,
      title: snippet.title,
      language: snippet.language,
      createdAt: snippet.createdAt,
      updatedAt: snippet.updatedAt,
      latestVersion: snippet.versions[0] || null,
    }));

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/history", async (req, res, next) => {
  try {
    const snippet = await Snippet.findById(req.params.id).select("title language versions");
    if (!snippet) {
      return res.status(404).json({ message: "Snippet not found." });
    }

    const history = snippet.versions.map((version, index) => ({
      version: index + 1,
      code: version.code,
      timestamp: version.timestamp,
    }));

    return res.json({
      snippetId: snippet.id,
      title: snippet.title,
      language: snippet.language,
      history,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: "Snippet not found." });
    }

    return res.json(toClientSnippet(snippet));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { code, title, language } = req.body;

    if (typeof code !== "string") {
      return res
        .status(400)
        .json({ message: "`code` is required and must be a string." });
    }

    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: "Snippet not found." });
    }

    if (typeof title === "string" && title.trim()) {
      snippet.title = title.trim();
    }

    if (typeof language === "string" && language.trim()) {
      snippet.language = language.trim().toLowerCase();
    }

    snippet.versions.push({ code, timestamp: new Date() });
    await snippet.save();

    if (req.io) {
      req.io.to(snippet.id).emit("snippet-version-created", {
        snippetId: snippet.id,
        version: snippet.versions[snippet.versions.length - 1],
        updatedAt: snippet.updatedAt,
      });
    }

    return res.json(toClientSnippet(snippet));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
