# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5.0 | :x:                |

---

## Security Architecture & Privacy Safeguards

This project is architected with privacy and data protection as top priorities:

1. **Local & Self-Hosted**: All chats, contacts, media, and encryption keys are stored locally on your own machine in PostgreSQL and the local filesystem (`backend/storage/`). No telemetry, analytics, or messages are ever sent to third-party cloud servers.
2. **Encrypted Baileys Session Storage**: Baileys multi-device authentication credentials and key pairs are encrypted at rest using industry-standard **AES-256-GCM** before being saved to PostgreSQL (`auth_keys` and `sessions` tables).
3. **Zero External API AI Concierge**: The built-in AI auto-reply system operates entirely on local regex and intent matching without sending chat contents to external LLM providers (e.g. OpenAI, Anthropic, Google). Your conversations remain 100% private.
4. **Anti-Ban Outbox Queue**: All message sends, reactions, edits, and revokes are buffered through an anti-ban send queue with randomized human delays (1.5s–3.5s) and strict rate limit ceilings (20/min, 300/hour).
5. **SSRF-Protected Link Previews**: Server-side URL link preview fetches strictly validate and block internal loopback, private IPv4/IPv6 ranges (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`, `::1`), enforce connection timeouts, and stream at a strict 1 MB download cap.

---

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it responsibly:

- **Do NOT open a public GitHub issue** with sensitive exploit details.
- Please create a **Private Security Advisory** via GitHub's Security Advisory tab or reach out to the project maintainers directly.
- Include a detailed description of the vulnerability, steps to reproduce, and any proof-of-concept scripts.

We take security seriously and will investigate and patch verified vulnerabilities promptly.
