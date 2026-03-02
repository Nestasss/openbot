# Messenger (MVP)

Domains:
- https://chat.notificbot.ru  → frontend (PWA)
- https://api.notificbot.ru   → backend (REST + Socket.IO)

Infra:
- Host nginx terminates TLS and proxies to:
  - 127.0.0.1:8080 (web)
  - 127.0.0.1:3000 (api)

Planned stack:
- NestJS + Prisma + Postgres
- Redis for OTP/rate-limit
- React PWA (Vite)

