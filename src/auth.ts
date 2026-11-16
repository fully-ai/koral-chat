import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { KoralDatabase, UserRecord } from "./db.js";

export interface AuthPayload {
  sub: string;
  username: string;
  role: "admin" | "member";
}

export interface AuthedRequest extends Request {
  user?: UserRecord;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function signToken(user: UserRecord, secret: string): string {
  const payload: AuthPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, secret, { expiresIn: "12h" });
}

export function verifyToken(token: string, secret: string): AuthPayload {
  return jwt.verify(token, secret) as AuthPayload;
}

export function requireAuth(db: KoralDatabase, secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }
    try {
      const payload = verifyToken(header.slice(7), secret);
      const user = db.getUserById(payload.sub);
      if (!user) {
        res.status(401).json({ error: "User no longer exists" });
        return;
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Administrator privileges required" });
    return;
  }
  next();
}
