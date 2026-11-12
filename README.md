# WhatsApp Web Client

<p align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/message-square-text.svg" width="64" height="64" alt="WhatsApp Client Logo" />
</p>

<p align="center">
  <strong>A modern, privacy-first WhatsApp Web client and personal concierge built with Baileys, Node.js, Fastify, React, Vite, Tailwind CSS, and PostgreSQL.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Fastify-4.28-black?style=flat-square&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-5.22-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Vitest-101%20Tests%20Passed-729B1B?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

---

## Highlights & Features

- **Linked Device Authentication**: QR code pairing and phone-number pairing code via Baileys multi-device protocol (`@whiskeysockets/baileys`).
- **Encrypted Session Storage**: Multi-device credentials, encryption keys, and app state are encrypted at rest with **AES-256-GCM** inside PostgreSQL.
- **Clean Light & Dark Design**: Polished design system modeled after modern WhatsApp Web with custom CSS design tokens, responsive layouts, and density modes (Comfortable vs Compact).
- **Anti-Ban Outbox Queue**: All outgoing messages, reactions, edits, and revokes are enqueued into an Outbox worker with human-like jitter delays (1.5s–3.5s) and sliding-window rate limits (20/min, 300/hour).
- **Zero-API AI Auto-Reply Concierge**:
  - **Human Simulation**: 8–14 second reading delay + 2.5–6.5 second typing simulation (`composing` state).
  - **Auto-Cancellation**: Immediately aborts auto-reply if you reply manually from your phone.
  - **Privacy First**: 100% local intent matching — zero external API keys, zero cloud LLM data leaks.
  - **Customizable Knowledge Base**: Answers identity questions (*"Who are you?"*), YouTube channel links & subscriber counts, Google Meet scheduling, and socials directly from your Settings config.
  - **Anti-Ban Safety**: Off by default, enabled per-chat; permanently blocked for group chats (`@g.us`).
- **Rich Media & Voice Notes**:
  - Drag-and-drop & clipboard paste for images, videos, audio, and documents.
  - Voice recording in-browser converted server-side to WhatsApp-compliant OGG/Opus mono 16 kHz via bundled `ffmpeg-static`.
  - Full-screen lightbox viewer (`MediaLightbox`) and custom waveform audio player (`AudioPlayer`).
- **Group Chats**:
  - Participant rosters with admin & superadmin badges.
  - `@` autocomplete mention pills (`contextInfo.mentionedJid`).
  - Announce-only restriction enforcement (read-only for non-admins).
- **Message Actions**:
  - 6 quick emoji reactions + custom emoji picker with tap-to-remove.
  - Quoted replies with instant jump-to-message.
  - Star / unstar messages with a global modal viewer.
  - Edit text messages within 15 minutes.
  - Delete for Me and Delete for Everyone (revoke).
  - **Anti-Revoke**: Preserves messages and media deleted by the sender with a visual deleted badge.
- **Chat Management**:
  - Pin up to 3 priority chats.
  - Archive chats with instant undo toast.
  - Mute notifications (8 hours, 1 week, always).
  - Mark as unread badge.
  - Dynamic filter tabs (All, Unread, Groups, Archived).
- **Contact & Group Info Drawer**:
  - High-res avatars, phone numbers, verified badges, and lazily fetched status texts (7-day cache).
  - Shared media explorer (Media grid, Docs list, Links list, Starred messages).
  - SSRF-safe OpenGraph link preview generator.

---

## Project Structure

```
whatsapp-client/
├── backend/
│   ├── prisma/             # Database schema & migrations (Sessions, Messages, Chats, Outbox, AI)
│   ├── src/
│   │   ├── config/         # Zod-validated environment config
│   │   ├── routes/         # REST API endpoints (sessions, chats, messages, groups, ai, settings)
│   │   ├── services/       # Outbox queue, AI responder, voice converter, link preview, avatar queue
│   │   └── whatsapp/       # Baileys session manager, message parser, name resolver, merge service
│   ├── storage/            # Local media, avatar, and preview caches (ignored in Git)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Chat bubbles, message input, audio player, lightbox, modals
│   │   ├── store/          # Zustand UI & toast state management
│   │   ├── views/          # ChatsView, SettingsView, ConnectionView, LoginView
│   │   └── styles/         # Clean Light tokens & Tailwind configuration
│   └── package.json
├── infra/                  # Docker Compose configuration (PostgreSQL 16 + Redis)
├── .env.example            # Root environment template
├── .gitignore              # Strict ignore rules (no secrets, credentials, or media)
├── CONTRIBUTING.md         # Guidelines for contributors
├── SECURITY.md             # Security architecture & vulnerability reporting
└── LICENSE                 # MIT License
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or newer (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **PostgreSQL**: Native PostgreSQL 16 (or Docker container) running on port `5432`
- **FFmpeg**: Bundled automatically via `ffmpeg-static` (no external installation required)

---

## Quickstart Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/whatsapp-client.git
cd whatsapp-client
```

### 2. Configure Environment Variables

Copy the example environment files for both backend and frontend:

```bash
# In the repository root
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Generate a secure 32-byte Base64 encryption key for session data:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Open `backend/.env` and update:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `ENCRYPTION_KEY`: The 32-byte Base64 key generated above.
- `JWT_SECRET`: Any random string (minimum 32 characters).
- `AUTH_ENABLED`: Keep `false` for single-user local development.

### 3. Run Database Migrations

```bash
cd backend
npm install
npx prisma migrate dev
```

### 4. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## Running Locally

Open two terminal windows:

### Terminal 1: Backend API Server
```bash
cd backend
npm run dev
```
*Backend runs at [http://127.0.0.1:3000](http://127.0.0.1:3000) (Health check: `/api/health`)*

### Terminal 2: Frontend Web App
```bash
cd frontend
npm run dev
```
*Frontend runs at [http://localhost:5173](http://localhost:5173)*

### Linking Your WhatsApp Account

1. Open [http://localhost:5173](http://localhost:5173) in your browser.
2. Select your session and click **Connect**.
3. Scan the displayed QR code with your phone via **WhatsApp > Linked Devices > Link a Device**.
4. Once paired, your conversations and contacts will sync in real time.

---

## Running with Docker (Optional Infra)

If you prefer running PostgreSQL and Redis via Docker:

```bash
cd infra
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `127.0.0.1:5432`
- **Redis 7** on `127.0.0.1:6379`

---

## Running Automated Tests

The backend includes a comprehensive Vitest test suite covering encryption, message parsing, name resolution, contact merging, outbox anti-ban algorithms, and AI intent matching:

```bash
cd backend
npm test -- --run
```

All 101 unit tests across 10 test suites run in ~3.5 seconds.

---

## AI Auto-Reply & Anti-Ban Architecture

```
Incoming WhatsApp Message
         │
         ▼
[Ingestion Service] ─── Is AI enabled for this chat? (1-on-1 only, never @g.us)
         │ Yes
         ▼
[AI Responder] ──────── Randomized 8–14s Human Reading Delay
         │ (Aborts if you send a manual message during delay)
         ▼
[Typing Simulator] ──── Sends 'composing' presence for 2.5–6.5s
         │
         ▼
[Intent Matcher] ────── Local zero-API matching:
         ├─ Identity / Bio ("Who are you?")
         ├─ YouTube ("Channel link & subs")
         ├─ Meeting ("Schedule Google Meet")
         ├─ Socials ("Instagram & links")
         └─ Polite Away Fallback
         │
         ▼
[Outbox Queue] ──────── Random jitter (1.5–3.5s) & Rate Limits (20/min, 300/hr)
         │
         ▼
WhatsApp Recipient
```

---

## WhatsApp Protocol Limitations Matrix

| Feature | Supported via Baileys 6.7.24 | Protocol Restriction / Limitation |
| :--- | :---: | :--- |
| **Reactions** | ✅ | Sending empty text `""` removes existing reaction. |
| **Delete for Everyone** | ✅ | Revokes own messages within ~48 hours. |
| **Edit Message** | ✅ | Text messages only; strictly within 15 minutes of sending. |
| **Forward Message** | ✅ | Max 5 chats per forward as per WhatsApp anti-spam rules. |
| **Star / Unstar** | ✅ | Synced via Baileys app patch (`chatModify.star`). |
| **Group Mentions** | ✅ | Recipient client highlights JIDs listed in `mentionedJid`. |
| **Announce-Only** | ✅ | Non-admin sends are rejected by WhatsApp servers. |
| **Read Receipts** | ✅ | Configurable; turn OFF in Settings for stealth reading. |

---

## Security & Privacy Notice

- **Never Commit `.env` Files**: Your `.env` contains database credentials and encryption keys. The `.gitignore` is preconfigured to ignore all `.env` files except `.env.example`.
- **Local Storage**: All media and cached avatars reside in `backend/storage/`, which is ignored by Git.
- **Anti-Ban Notice**: This client is designed for personal productivity and authorized communications. Do not use this software for bulk messaging, unsolicited marketing, or spam. Adhere to WhatsApp's Terms of Service.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp, Meta, or any of their subsidiaries or affiliates. The official WhatsApp website can be found at [https://whatsapp.com](https://whatsapp.com).
