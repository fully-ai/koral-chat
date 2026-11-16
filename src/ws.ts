import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "./auth.js";
import type { KoralDatabase } from "./db.js";

interface ClientMeta {
  userId: string;
  username: string;
  role: "admin" | "member";
  channelId: string;
}

export class ChatHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientMeta>();

  constructor(
    server: http.Server,
    private readonly db: KoralDatabase,
    private readonly jwtSecret: string
  ) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url ?? "/ws", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    let user;
    try {
      const payload = verifyToken(token, this.jwtSecret);
      user = this.db.getUserById(payload.sub);
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }
    if (!user) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const meta: ClientMeta = {
      userId: user.id,
      username: user.username,
      role: user.role,
      channelId: "general",
    };
    this.clients.set(ws, meta);
    this.broadcastPresence();

    ws.on("message", (raw) => this.handleMessage(ws, raw.toString("utf8")));
    ws.on("close", () => {
      this.clients.delete(ws);
      this.broadcastPresence();
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    const meta = this.clients.get(ws);
    if (!meta) return;

    let msg: { type?: string; channelId?: string; content?: string; attachmentId?: string | null };
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Invalid JSON payload" }));
      return;
    }

    if (msg.type === "join" && msg.channelId) {
      if (this.db.getChannel(msg.channelId)) {
        meta.channelId = msg.channelId;
        this.broadcastPresence();
      }
      return;
    }

    if (msg.type === "chat") {
      const currentUser = this.db.getUserById(meta.userId);
      if (!currentUser || currentUser.is_muted) {
        ws.send(JSON.stringify({ type: "error", error: "You are muted and cannot send messages" }));
        return;
      }
      const channelId = msg.channelId ?? meta.channelId;
      const content = (msg.content ?? "").trim();
      if (!content || content.length > 4000) {
        ws.send(JSON.stringify({ type: "error", error: "Message must be 1..4000 characters" }));
        return;
      }
      if (!this.db.getChannel(channelId)) {
        ws.send(JSON.stringify({ type: "error", error: "Channel not found" }));
        return;
      }
      const saved = this.db.createMessage(
        channelId,
        currentUser.id,
        currentUser.username,
        content,
        msg.attachmentId ?? null
      );
      this.broadcastToChannel(channelId, { type: "message", message: saved });
    }
  }

  public onlineUsernames(): string[] {
    const names = new Set<string>();
    for (const meta of this.clients.values()) {
      names.add(meta.username);
    }
    return Array.from(names).sort();
  }

  public broadcastPresence(): void {
    this.broadcastAll({ type: "presence", onlineUsers: this.onlineUsernames() });
  }

  public broadcastToChannel(channelId: string, payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const [ws, meta] of this.clients.entries()) {
      if (meta.channelId === channelId && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  public broadcastAll(payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  public close(): void {
    this.wss.close();
  }
}
