# Changelog

## [0.2.0] - 2026-11-16

### Added
- Structured JSON HTTP request logging middleware.
- Admin moderation controls (mute/unmute user drawer and message delete buttons) in the web UI.
- Expanded integration tests for channel creation and admin message deletion.
- Full 19-section README with Mermaid architecture diagram and API table.

## [0.1.0] - 2026-11-16

### Added
- Express + WebSocket (`ws`) real-time chat server in TypeScript.
- Persistent SQLite storage (`node:sqlite`) for users, channels, messages, files, and admin audit logs.
- Scrypt password hashing, JWT authentication, rate limiting, and Helmet HTTP headers.
- Admin moderation endpoints (mute/unmute users, delete messages, audit log) and responsive web UI.
