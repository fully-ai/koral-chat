# Architecture — Koral Chat

## Components

- `src/app.ts`: Express server configuring Helmet headers, rate limiting, JWT auth endpoints, channel/message REST routes, file upload/download, and admin moderation APIs.
- `src/ws.ts` (`ChatHub`): WebSocket server at `/ws` handling bearer token handshake authentication, channel membership, presence broadcasting, and muted-user enforcement.
- `src/db.ts` (`KoralDatabase`): Synchronous SQLite (`node:sqlite`, WAL mode) storage for `users`, `channels`, `messages`, `files`, and `audit_logs`.
- `src/auth.ts`: Scrypt (`crypto.scryptSync` + `crypto.timingSafeEqual`) password hashing and JWT token signing/verification.
- `src/files.ts`: Extension allowlist, size boundary enforcement, and UUID storage naming.
