import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".json", "application/json"],
]);

export function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName);
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return cleaned.slice(0, 120) || "file";
}

export function storeUploadedFile(
  uploadDir: string,
  originalName: string,
  buffer: Buffer,
  maxBytes: number
): { id: string; originalName: string; storedName: string; mimeType: string; sizeBytes: number } {
  if (buffer.length === 0) {
    throw new Error("File is empty");
  }
  if (buffer.length > maxBytes) {
    throw new Error(`File exceeds maximum size of ${maxBytes} bytes`);
  }
  const safeName = sanitizeFilename(originalName);
  const ext = path.extname(safeName).toLowerCase();
  const mimeType = ALLOWED_EXTENSIONS.get(ext);
  if (!mimeType) {
    throw new Error(`Unsupported file extension '${ext || "(none)"}'`);
  }

  const id = crypto.randomUUID();
  const storedName = `${id}${ext}`;
  fs.mkdirSync(uploadDir, { recursive: true });
  const targetPath = path.resolve(uploadDir, storedName);
  if (path.dirname(targetPath) !== path.resolve(uploadDir)) {
    throw new Error("Invalid file path");
  }
  fs.writeFileSync(targetPath, buffer);
  return {
    id,
    originalName: safeName,
    storedName,
    mimeType,
    sizeBytes: buffer.length,
  };
}
