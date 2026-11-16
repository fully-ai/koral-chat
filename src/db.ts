import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "member";
  is_muted: number;
  created_at: string;
}

export interface ChannelRecord {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  content: string;
  attachment_id: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  uploader_id: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export class KoralDatabase {
  public readonly db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "koral.db");
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
        is_muted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        uploader_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);

    const countRow = this.db.prepare("SELECT COUNT(*) as cnt FROM channels").get() as { cnt: number };
    if (countRow.cnt === 0) {
      this.db
        .prepare("INSERT INTO channels (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
        .run("general", "general", "General discussion", "system", new Date().toISOString());
    }
  }

  close(): void {
    this.db.close();
  }

  userCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    return row.cnt;
  }

  createUser(username: string, passwordHash: string): UserRecord {
    const id = crypto.randomUUID();
    const role: "admin" | "member" = this.userCount() === 0 ? "admin" : "member";
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO users (id, username, password_hash, role, is_muted, created_at) VALUES (?, ?, ?, ?, 0, ?)"
      )
      .run(id, username, passwordHash, role, now);
    return this.getUserById(id)!;
  }

  getUserByUsername(username: string): UserRecord | undefined {
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRecord | undefined;
  }

  getUserById(id: string): UserRecord | undefined {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRecord | undefined;
  }

  listUsers(): Array<Omit<UserRecord, "password_hash">> {
    return this.db
      .prepare("SELECT id, username, role, is_muted, created_at FROM users ORDER BY username ASC")
      .all() as Array<Omit<UserRecord, "password_hash">>;
  }

  setUserMuted(userId: string, muted: boolean): boolean {
    const res = this.db.prepare("UPDATE users SET is_muted = ? WHERE id = ?").run(muted ? 1 : 0, userId);
    return res.changes > 0;
  }

  listChannels(): ChannelRecord[] {
    return this.db.prepare("SELECT * FROM channels ORDER BY name ASC").all() as unknown as ChannelRecord[];
  }

  getChannel(id: string): ChannelRecord | undefined {
    return this.db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRecord | undefined;
  }

  createChannel(name: string, description: string, createdBy: string): ChannelRecord {
    const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO channels (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, description, createdBy, now);
    return this.getChannel(id)!;
  }

  createMessage(
    channelId: string,
    userId: string,
    username: string,
    content: string,
    attachmentId: string | null = null
  ): MessageRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO messages (id, channel_id, user_id, username, content, attachment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, channelId, userId, username, content, attachmentId, now);
    return this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRecord;
  }

  listMessages(channelId: string, limit = 100): MessageRecord[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?")
      .all(channelId, limit) as unknown as MessageRecord[];
  }

  deleteMessage(messageId: string): boolean {
    const res = this.db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
    return res.changes > 0;
  }

  createFile(
    id: string,
    uploaderId: string,
    originalName: string,
    storedName: string,
    mimeType: string,
    sizeBytes: number
  ): FileRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO files (id, uploader_id, original_name, stored_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, uploaderId, originalName, storedName, mimeType, sizeBytes, now);
    return this.getFile(id)!;
  }

  getFile(id: string): FileRecord | undefined {
    return this.db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord | undefined;
  }

  logAudit(actorId: string, action: string, targetId: string, details = ""): void {
    this.db
      .prepare("INSERT INTO audit_logs (id, actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), actorId, action, targetId, details, new Date().toISOString());
  }

  listAuditLogs(limit = 50): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
  }
}
