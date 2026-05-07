require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const snippetsRouter = require("./routes/snippets");

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/collab_workspace";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";
const ALLOWED_ORIGINS = FRONTEND_URL.split(",").map((origin) => origin.trim());

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/snippets", snippetsRouter);

io.on("connection", (socket) => {
  socket.on("join-snippet", (snippetId) => {
    if (typeof snippetId !== "string" || snippetId.trim() === "") {
      return;
    }
    socket.join(snippetId);
  });

  socket.on("leave-snippet", (snippetId) => {
    if (typeof snippetId !== "string" || snippetId.trim() === "") {
      return;
    }
    socket.leave(snippetId);
  });

  socket.on("code-change", (payload = {}) => {
    const { snippetId, code } = payload;

    if (typeof snippetId !== "string" || typeof code !== "string") {
      return;
    }

    socket.to(snippetId).emit("remote-code-change", {
      snippetId,
      code,
      updatedAt: new Date().toISOString(),
    });
  });
});

app.use((error, _req, res, _next) => {
  if (error.name === "CastError") {
    return res.status(400).json({ message: "Invalid resource id." });
  }

  console.error(error);
  return res.status(500).json({ message: "Internal server error." });
});

async function bootstrap() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(MONGO_URI);
  console.log(`MongoDB connected at ${MONGO_URI}`);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  await mongoose.connection.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch(() => process.exit(1));
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(() => process.exit(1));
});

bootstrap().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
