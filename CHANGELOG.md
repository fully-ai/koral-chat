# Changelog

## [0.1.0] - 2026-11-16

### Added
- Express + WebSocket (`ws`) real-time chat server in TypeScript.
- Persistent SQLite storage (`node:sqlite`) for users, channels, messages, files, and admin audit logs.
- Scrypt password hashing, JWT authentication, rate limiting, and Helmet HTTP headers.
- Admin moderation endpoints (mute/unmute users, delete messages, audit log) and responsive web UI.
