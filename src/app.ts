import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { hashPassword, requireAdmin, requireAuth, signToken, verifyPassword, type AuthedRequest } from "./auth.js";
import type { KoralConfig } from "./config.js";
import { KoralDatabase } from "./db.js";
import { storeUploadedFile } from "./files.js";
import { ChatHub } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

export interface KoralServer {
  app: express.Express;
  server: http.Server;
  db: KoralDatabase;
  hub: ChatHub;
}

export function createKoralServer(config: KoralConfig): KoralServer {
  const db = new KoralDatabase(config.dataDir);
  const uploadDir = path.join(config.dataDir, "uploads");
  const app = express();
  const server = http.createServer(app);
  const hub = new ChatHub(server, db, config.jwtSecret);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "256kb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const auth = requireAuth(db, config.jwtSecret);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", onlineUsers: hub.onlineUsernames().length });
  });

  app.post("/api/auth/register", (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      res.status(400).json({ error: "Username must be 3-32 alphanumeric, underscore, or hyphen characters" });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: "Password must be 8-128 characters" });
      return;
    }
    if (db.getUserByUsername(username)) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const user = db.createUser(username, hashPassword(password));
    const token = signToken(user, config.jwtSecret);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, is_muted: Boolean(user.is_muted) },
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const user = db.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken(user, config.jwtSecret);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, is_muted: Boolean(user.is_muted) },
    });
  });

  app.get("/api/auth/me", auth, (req: AuthedRequest, res) => {
    const u = req.user!;
    res.json({ id: u.id, username: u.username, role: u.role, is_muted: Boolean(u.is_muted) });
  });

  app.get("/api/channels", auth, (_req, res) => {
    res.json({ channels: db.listChannels() });
  });

  app.post("/api/channels", auth, (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? "").trim();
    const description = String(req.body?.description ?? "").trim().slice(0, 200);
    if (!/^[a-zA-Z0-9_-]{2,40}$/.test(name)) {
      res.status(400).json({ error: "Channel name must be 2-40 characters (letters, numbers, _, -)" });
      return;
    }
    try {
      const channel = db.createChannel(name, description, req.user!.id);
      hub.broadcastAll({ type: "channel_created", channel });
      res.status(201).json(channel);
    } catch {
      res.status(409).json({ error: "Channel already exists" });
    }
  });

  app.get("/api/channels/:id/messages", auth, (req, res) => {
    const channelId = String(req.params.id);
    if (!db.getChannel(channelId)) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    res.json({ messages: db.listMessages(channelId, 100) });
  });

  app.post("/api/files", auth, upload.single("file"), (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }
    try {
      const stored = storeUploadedFile(uploadDir, req.file.originalname, req.file.buffer, config.maxUploadBytes);
      const record = db.createFile(
        stored.id,
        req.user!.id,
        stored.originalName,
        stored.storedName,
        stored.mimeType,
        stored.sizeBytes
      );
      res.status(201).json(record);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload rejected" });
    }
  });

  app.get("/api/files/:id", auth, (req, res) => {
    const file = db.getFile(String(req.params.id));
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const target = path.resolve(uploadDir, path.basename(file.stored_name));
    if (path.dirname(target) !== path.resolve(uploadDir)) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    res.type(file.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);
    res.sendFile(target);
  });

  // Admin moderation endpoints
  app.get("/api/admin/users", auth, requireAdmin, (_req, res) => {
    res.json({ users: db.listUsers() });
  });

  app.post("/api/admin/users/:id/mute", auth, requireAdmin, (req: AuthedRequest, res) => {
    const muted = Boolean(req.body?.muted ?? true);
    const targetId = String(req.params.id);
    if (!db.setUserMuted(targetId, muted)) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    db.logAudit(req.user!.id, muted ? "mute_user" : "unmute_user", targetId);
    hub.broadcastAll({ type: "user_muted", userId: targetId, muted });
    res.json({ status: "ok", userId: targetId, muted });
  });

  app.delete("/api/admin/messages/:id", auth, requireAdmin, (req: AuthedRequest, res) => {
    const msgId = String(req.params.id);
    if (!db.deleteMessage(msgId)) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    db.logAudit(req.user!.id, "delete_message", msgId);
    hub.broadcastAll({ type: "message_deleted", messageId: msgId });
    res.json({ status: "deleted", messageId: msgId });
  });

  app.get("/api/admin/audit", auth, requireAdmin, (_req, res) => {
    res.json({ logs: db.listAuditLogs() });
  });

  app.use(express.static(PUBLIC_DIR));

  return { app, server, db, hub };
}
