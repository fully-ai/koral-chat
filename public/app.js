let token = localStorage.getItem("koral_token") || "";
let currentUser = null;
let activeChannel = "general";
let ws = null;
let pendingAttachmentId = null;

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function authenticate(endpoint) {
  $("auth-error").textContent = "";
  try {
    const data = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("auth-username").value.trim(),
        password: $("auth-password").value,
      }),
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem("koral_token", token);
    await enterApp();
  } catch (err) {
    $("auth-error").textContent = err.message;
  }
}

async function enterApp() {
  if (!currentUser) {
    currentUser = await api("/api/auth/me");
  }
  $("auth-screen").classList.add("hidden");
  $("app-screen").classList.remove("hidden");
  $("current-user-badge").textContent = `${currentUser.username} (${currentUser.role})`;
  await loadChannels();
  await loadMessages(activeChannel);
  connectWebSocket();
}

function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  ws.onmessage = (evt) => {
    const payload = JSON.parse(evt.data);
    if (payload.type === "message" && payload.message.channel_id === activeChannel) {
      appendMessage(payload.message);
    } else if (payload.type === "presence") {
      renderOnline(payload.onlineUsers);
    } else if (payload.type === "channel_created") {
      loadChannels();
    }
  };
}

async function loadChannels() {
  const { channels } = await api("/api/channels");
  const list = $("channel-list");
  list.innerHTML = "";
  for (const ch of channels) {
    const li = document.createElement("li");
    li.textContent = `#${ch.name}`;
    li.className = ch.id === activeChannel ? "active" : "";
    li.onclick = async () => {
      activeChannel = ch.id;
      $("active-channel-name").textContent = `#${ch.name}`;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "join", channelId: ch.id }));
      }
      await loadChannels();
      await loadMessages(ch.id);
    };
    list.appendChild(li);
  }
}

async function loadMessages(channelId) {
  const { messages } = await api(`/api/channels/${channelId}/messages`);
  $("message-feed").innerHTML = "";
  for (const m of messages) appendMessage(m);
}

function appendMessage(m) {
  const div = document.createElement("div");
  div.className = "msg-row";
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = `${m.username} • ${new Date(m.created_at).toLocaleTimeString()}`;
  const body = document.createElement("div");
  body.textContent = m.content;
  div.append(meta, body);
  if (m.attachment_id) {
    const link = document.createElement("a");
    link.href = `/api/files/${m.attachment_id}`;
    link.target = "_blank";
    link.textContent = "View Attachment";
    div.appendChild(link);
  }
  const feed = $("message-feed");
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function renderOnline(users) {
  const list = $("online-list");
  list.innerHTML = "";
  for (const u of users) {
    const li = document.createElement("li");
    li.textContent = `● ${u}`;
    list.appendChild(li);
  }
}

$("login-btn").onclick = () => authenticate("/api/auth/login");
$("register-btn").onclick = () => authenticate("/api/auth/register");
$("logout-btn").onclick = () => {
  localStorage.removeItem("koral_token");
  location.reload();
};
$("add-channel-btn").onclick = async () => {
  const name = prompt("New channel name:");
  if (!name) return;
  await api("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
};
$("file-upload").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.ok) {
    const record = await res.json();
    pendingAttachmentId = record.id;
  }
};
$("send-btn").onclick = () => {
  const content = $("msg-input").value.trim();
  if (!content || !ws) return;
  ws.send(JSON.stringify({ type: "chat", channelId: activeChannel, content, attachmentId: pendingAttachmentId }));
  $("msg-input").value = "";
  pendingAttachmentId = null;
};
$("msg-input").onkeydown = (e) => {
  if (e.key === "Enter") $("send-btn").click();
};

if (token) {
  enterApp().catch(() => {
    localStorage.removeItem("koral_token");
    token = "";
  });
}
