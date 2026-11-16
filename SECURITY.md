# Security Policy

Report vulnerabilities privately via GitHub Security Advisories.

## Hardening Notes

- Always set a strong random `KORAL_JWT_SECRET` in production.
- Passwords are hashed with `crypto.scryptSync` and verified with `crypto.timingSafeEqual`.
- File uploads enforce extension allowlists, byte limits, and UUID filenames.
