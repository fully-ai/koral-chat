import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { createKoralServer } from "../dist/app.js";
import { loadConfig } from "../dist/config.js";

let tmpDir;
let koral;
let baseUrl;
let wsUrl;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "koral-test-"));
  const cfg = loadConfig({
    host: "127.0.0.1",
    port: 0,
    jwtSecret: "test-secret-key-for-koral-integration-suite",
    dataDir: tmpDir,
    maxUploadBytes: 1024 * 64,
    rateLimitMax: 500,
  });
  koral = createKoralServer(cfg);
  await new Promise((resolve) => koral.server.listen(0, "127.0.0.1", resolve));
  const addr = koral.server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

after(async () => {
  koral.hub.close();
  await new Promise((resolve) => koral.server.close(resolve));
  koral.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function nextMessage(ws, predicate) {
  return new Promise((resolve) => {
    const onMsg = (raw) => {
      const parsed = JSON.parse(raw.toString("utf8"));
      if (predicate(parsed)) {
        ws.off("message", onMsg);
        resolve(parsed);
      }
    };
    ws.on("message", onMsg);
  });
}

test("registration, login, WebSocket messaging, file sharing, and admin moderation", async () => {
  // 1. Register first user (becomes admin) and second user (member)
  const adminRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "password123" }),
  });
  assert.equal(adminRes.status, 201);
  const adminData = await adminRes.json();
  assert.equal(adminData.user.role, "admin");

  const memberRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bob", password: "password123" }),
  });
  assert.equal(memberRes.status, 201);
  const memberData = await memberRes.json();
  assert.equal(memberData.user.role, "member");

  // 2. Connect both over WebSocket and verify real-time broadcast
  const wsAlice = await connectWs(adminData.token);
  const wsBob = await connectWs(memberData.token);

  const msgPromise = nextMessage(wsBob, (m) => m.type === "message" && m.message.content === "Hello Koral!");
  wsAlice.send(JSON.stringify({ type: "chat", channelId: "general", content: "Hello Koral!" }));
  const received = await msgPromise;
  assert.equal(received.message.username, "alice");

  // 3. Verify message persistence
  const histRes = await fetch(`${baseUrl}/api/channels/general/messages`, {
    headers: { Authorization: `Bearer ${memberData.token}` },
  });
  const hist = await histRes.json();
  assert.equal(hist.messages.length, 1);

  // 4. File upload: valid .txt succeeds, .exe rejected
  const form = new FormData();
  form.append("file", new Blob(["Deployment notes"], { type: "text/plain" }), "notes.txt");
  const uploadOk = await fetch(`${baseUrl}/api/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminData.token}` },
    body: form,
  });
  assert.equal(uploadOk.status, 201);
  const uploaded = await uploadOk.json();

  const dl = await fetch(`${baseUrl}/api/files/${uploaded.id}`, {
    headers: { Authorization: `Bearer ${memberData.token}` },
  });
  assert.equal(dl.status, 200);
  assert.equal(await dl.text(), "Deployment notes");

  const badForm = new FormData();
  badForm.append("file", new Blob(["MZ"], { type: "application/octet-stream" }), "bad.exe");
  const uploadBad = await fetch(`${baseUrl}/api/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminData.token}` },
    body: badForm,
  });
  assert.equal(uploadBad.status, 400);

  // 5. Admin moderation: non-admin forbidden, admin mutes bob
  const forbiddenMute = await fetch(`${baseUrl}/api/admin/users/${memberData.user.id}/mute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberData.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ muted: true }),
  });
  assert.equal(forbiddenMute.status, 403);

  const adminMute = await fetch(`${baseUrl}/api/admin/users/${memberData.user.id}/mute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminData.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ muted: true }),
  });
  assert.equal(adminMute.status, 200);

  const muteErr = nextMessage(wsBob, (m) => m.type === "error");
  wsBob.send(JSON.stringify({ type: "chat", channelId: "general", content: "Should fail" }));
  const errPayload = await muteErr;
  assert.match(errPayload.error, /muted/i);

  // 6. Channel creation & admin message deletion
  const chRes = await fetch(`${baseUrl}/api/channels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminData.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "devops", description: "Infra alerts" }),
  });
  assert.equal(chRes.status, 201);

  const delMsg = await fetch(`${baseUrl}/api/admin/messages/${received.message.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminData.token}` },
  });
  assert.equal(delMsg.status, 200);

  // 7. Audit log recorded mute + delete
  const auditRes = await fetch(`${baseUrl}/api/admin/audit`, {
    headers: { Authorization: `Bearer ${adminData.token}` },
  });
  const audit = await auditRes.json();
  assert.equal(audit.logs.length, 2);
  assert.equal(audit.logs[0].action, "delete_message");

  wsAlice.close();
  wsBob.close();
});
