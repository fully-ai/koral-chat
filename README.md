# Koral Chat

Self-hosted real-time team chat platform built with TypeScript, Express, WebSockets (`ws`), and SQLite (`node:sqlite`).

## Features

- **Real-Time Messaging**: WebSocket (`/ws`) broadcast per channel with live online user presence.
- **Authentication & Roles**: Scrypt password hashing, JWT session tokens, and automatic admin assignment for the first registered user.
- **Persistent Storage**: SQLite (WAL mode) storing users, channels, messages, uploaded file metadata, and moderation audit logs.
- **Safe File Sharing**: Extension allowlist (`.png`, `.jpg`, `.webp`, `.gif`, `.txt`, `.md`, `.pdf`, `.json`), size limits, and UUID storage names.
- **Admin Moderation**: Mute/unmute users, delete messages, and inspect audit logs.
- **Security Controls**: Helmet HTTP headers, configurable rate limiting, and input validation.

## System Requirements

- Node.js 22.5+ (uses built-in `node:sqlite`)

## Installation & Running

```bash
git clone https://github.com/fully-ai/koral-chat.git
cd koral-chat
npm ci
npm run build
KORAL_JWT_SECRET="replace-with-a-random-secret" npm start
```

Open `http://127.0.0.1:3000`.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `KORAL_HOST` | `127.0.0.1` | Bind address |
| `KORAL_PORT` | `3000` | HTTP/WebSocket port |
| `KORAL_JWT_SECRET` | random per boot | JWT signing secret (set explicitly in production) |
| `KORAL_DATA_DIR` | `./data` | SQLite and uploaded files directory |
| `KORAL_MAX_UPLOAD_BYTES` | `5242880` | Max upload size (5 MiB) |
| `KORAL_RATE_LIMIT_MAX` | `120` | Max requests per minute per IP |

## Testing

```bash
npm run lint
npm test
```

## Docker Deployment

```bash
KORAL_JWT_SECRET="your-secret" docker compose up -d --build
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
