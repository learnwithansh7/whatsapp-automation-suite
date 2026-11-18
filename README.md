# WhatsApp Web Client & Automation Platform

<p align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/message-square-text.svg" width="64" height="64" alt="WhatsApp Client Logo" />
</p>

<p align="center">
  <strong>A privacy-first self-hosted WhatsApp Web client and automation engine built with Baileys, Node.js, Fastify, React, Vite, Tailwind CSS, and PostgreSQL.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Fastify-4.28-black?style=flat-square&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Vitest-101%20Tests%20Passed-729B1B?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

---

## Overview

This project is a standalone, self-hosted web client and messaging concierge for WhatsApp. It provides a clean, responsive web interface that connects directly to WhatsApp via the multi-device protocol using `@whiskeysockets/baileys`. 

Designed for developers, creators, small teams, and privacy-conscious users, it bridges daily messaging with smart local automations:
- **Zero-API AI Auto-Responder**: Replies to incoming inquiries (identity, services, pricing, socials, and meeting scheduling) entirely through local intent matching without sending your chat data to third-party cloud LLMs.
- **Anti-Ban Outbox Engine**: Protects your WhatsApp account from automated bans through randomized human delays, typing presence indicators, and rate limits.
- **Interactive Simulator**: Test and preview auto-replies safely directly from the Settings dashboard without touching live chats.
- **Self-Hosted Privacy**: All database records, session credentials, and downloaded media remain on your own machine.

---

## Screenshots

> *Recommended screenshots to capture and place in `docs/screenshots/`:*
> 1. `dashboard.png`: Active chat interface with sidebar, messages, and contact drawer.
> 2. `settings.png`: AI auto-reply configuration, knowledge base bio, and bulk action toggles.
> 3. `simulator.png`: Interactive Auto-Reply Simulator with preset trigger chips.

```
+-----------------------------------------------------------------------------------+
|  [Chats - Live]             Ansh Verma                                 [🤖 AI: ON]|
|  +--------------------+    +-----------------------------------------------------+|
|  | Search chats...    |    |                                                     ||
|  +--------------------+    |   [Contact] hii who are you?                        ||
|  | Ansh Verma    12:46|    |                                                     ||
|  | who are you     AI |    |   [AI Auto-Reply] Hey! I build web applications and ||
|  |                    |    |   create tech tutorials on YouTube...               ||
|  | Cape Tech     05 Nov|   |                                                     ||
|  +--------------------+    +-----------------------------------------------------+|
|                            | Type a message (@ to mention, Shift+Enter)...       ||
+-----------------------------------------------------------------------------------+
```

---

## Features

### 1. Zero-API AI Auto-Reply Concierge
- **100% Private Local Intent Matching**: Categorizes messages into greetings, identity (*"Who are you?"*), YouTube channel links & subscribers, Google Meet scheduling, services, pricing quotes, gratitude, and polite away fallbacks.
- **Human Behavior Simulation**: Enforces an 8–14 second reading delay followed by a proportional 2.5–6.5 second typing presence (`composing` state) before sending.
- **Automatic Cancellation**: If you send a manual reply from your mobile phone while an auto-reply is queued, the engine immediately cancels the pending automated response.
- **Self-Testing Triggers**: Test prompts directly in your chat box using `/ai <prompt>`, `@ai <prompt>`, or common trigger words with an expedited 2-second test delay.
- **Channel Exclusions**: Auto-reply is strictly blocked for group chats (`@g.us`), broadcast channels (`@newsletter`), and status broadcasts (`@broadcast`).

### 2. Interactive Auto-Reply Simulator
- Test incoming prompts in the **Settings** view with preset quick chips (*"who are you"*, *"give me youtube link"*, *"can we book google meet"*, *"pricing"*, *"social links"*).
- Displays detected intent, generated reply text, and human delay estimates before enabling live replies.

### 3. Anti-Ban Outbox Queue
- **Sequential Dispatching**: Serializes message sending per session to avoid sudden connection bursts.
- **Human Jitter Delays**: Enforces a randomized 1.5s–3.5s delay between consecutive outgoing messages.
- **Sliding-Window Rate Limits**: Caps outgoing traffic at 20 messages per minute and 300 messages per hour.
- **Self-Healing Encryption**: Automatically intercepts Signal session desynchronization errors (`Bad MAC` / `MessageCounterError`) and re-initiates clean handshakes.

### 4. Full-Featured Modern Web Client
- **Light & Dark Theme**: Custom CSS design tokens modeled after official WhatsApp Web.
- **Rich Media Support**: Images, videos, documents, and voice notes.
- **Voice Note Recording**: In-browser audio recording automatically converted server-side to WhatsApp-compliant Opus OGG mono 16 kHz via bundled `ffmpeg-static`.
- **Message Actions**: Quoted replies, 6 quick emoji reactions, message editing within 15 minutes, star messages, and message deletion/revocation.
- **Anti-Revoke**: Retains deleted-for-everyone messages locally with a visual deleted badge.
- **Bulk Chat Controls**: One-click bulk enable or disable AI auto-reply across all direct 1-on-1 chats.
- **Contact & Group Drawer**: View member rosters, admin permissions, and media grids.

---

## Tech Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite | TypeScript, Single Page App |
| **Styling & UI** | Tailwind CSS + Lucide Icons | Responsive layout, custom design tokens |
| **State Management** | TanStack Query v5 + Zustand | Optimistic updates, cache invalidation |
| **Backend Server** | Node.js + Fastify 4 | High-performance asynchronous API |
| **WhatsApp Protocol** | Baileys 6.7.24 | Multi-device WebSocket connection |
| **Database & ORM** | PostgreSQL 16 + Prisma 5 | Relational persistence with AES-256-GCM encryption |
| **Audio Processing** | `ffmpeg-static` | Audio transcoding to WhatsApp Opus OGG |
| **Testing** | Vitest 5 | 101 unit tests across 10 test suites |

---

## Architecture

```mermaid
flowchart TD
    User["Browser Client (React + Vite)"]
    API["Fastify API Server (Node.js)"]
    Outbox["Anti-Ban Outbox Worker"]
    AI["Zero-API AI Responder"]
    Baileys["Baileys Socket Manager"]
    DB[("PostgreSQL 16")]
    WA["WhatsApp WebSocket Servers"]

    User <-->|HTTP REST & Socket.IO| API
    API <-->|Prisma ORM| DB
    API -->|Queue Message| Outbox
    Outbox -->|Jitter & Rate Limits| Baileys
    Baileys <-->|Encrypted TLS| WA
    Baileys -->|messages.upsert| API
    API -->|Incoming Message| AI
    AI -->|Human Delay & Typing| Outbox
```

### Folder Architecture
- **`backend/src/whatsapp/`**: Baileys socket manager, custom Prisma auth state, message parser, contact merger, and Signal session handler.
- **`backend/src/services/`**: Outbox send queue, AI intent matcher, audio transcoder, link preview scraper, and media download queues.
- **`backend/src/routes/`**: Fastify REST endpoints for sessions, chats, messages, groups, settings, and AI controls.
- **`frontend/src/views/`**: Main view pages (`ChatsView`, `SettingsView`, `ConnectionView`, `LoginView`).
- **`frontend/src/components/`**: Modular chat bubbles, message inputs, audio players, media lightboxes, and modals.
- **`infra/`**: Docker Compose configuration for local PostgreSQL and Redis services.
- **`docs/`**: Detailed documentation for architecture, REST APIs, and anti-ban principles.

---

## Project Structure

```
whatsapp-client/
├── backend/
│   ├── prisma/             # Database schema & migrations
│   ├── src/
│   │   ├── config/         # Environment variable validation
│   │   ├── routes/         # REST API routes (sessions, chats, messages, ai)
│   │   ├── services/       # SendQueue, AiResponder, VoiceConverter, MediaStorage
│   │   └── whatsapp/       # Baileys manager, AuthState, MessageParser
│   ├── storage/            # Local media, avatars, and audio (git-ignored)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Chat bubbles, inputs, audio player, modals
│   │   ├── lib/            # Socket.IO client, API helpers, formatters
│   │   ├── store/          # Zustand stores for UI and toasts
│   │   ├── views/          # ChatsView, SettingsView, ConnectionView
│   │   └── styles/         # Tokens and Tailwind configuration
│   └── package.json
├── docs/                   # Architecture, API reference, and anti-ban guides
├── infra/                  # Docker Compose configuration for PostgreSQL
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules for privacy & secrets
├── CONTRIBUTING.md         # Guidelines for contributors
├── CODE_OF_CONDUCT.md      # Community code of conduct
├── SECURITY.md             # Security policy and vulnerability reporting
├── LICENSE                 # MIT License (Ansh Verma)
└── README.md
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **PostgreSQL**: Native PostgreSQL 16 (or running via Docker Compose)
- **WhatsApp Account**: An active WhatsApp phone number for QR pairing
- **AI API Key**: **None needed!** The AI auto-responder is 100% self-hosted and private.

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/whatsapp-client.git
cd whatsapp-client
```

### 2. Configure Environment Files
Copy the example environment configurations:
```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Generate a secure 32-byte Base64 key for database credential encryption:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Open `backend/.env` and configure:
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/whatsapp_client?schema=public`)
- `ENCRYPTION_KEY`: The 32-byte Base64 string generated above
- `JWT_SECRET`: Random 32+ character string

### 3. Setup Database & Backend
```bash
cd backend
npm install
npx prisma migrate dev
```

### 4. Setup Frontend
```bash
cd ../frontend
npm install
```

---

## Running the Application

Open two terminal windows:

### Terminal 1: Backend Server
```bash
cd backend
npm run dev
```
*Backend runs at `http://127.0.0.1:3000` (Health check: `/api/health`)*

### Terminal 2: Frontend Web App
```bash
cd frontend
npm run dev
```
*Frontend runs at `http://localhost:5173`*

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description | Example Placeholder |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment mode | `development` |
| `PORT` | Backend HTTP port | `3000` |
| `HOST` | Loopback bind interface | `127.0.0.1` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://user:password@localhost:5432/whatsapp_client?schema=public` |
| `ENCRYPTION_KEY` | 32-byte Base64 AES-256 key | `your_base64_encoded_32_byte_key_here=` |
| `JWT_SECRET` | Secret key for JWT sessions | `your_secure_jwt_secret_min_32_chars_here` |
| `AUTH_ENABLED` | Require dashboard login | `false` |
| `SEND_MIN_DELAY_MS` | Minimum Outbox jitter delay | `1500` |
| `SEND_MAX_DELAY_MS` | Maximum Outbox jitter delay | `3500` |
| `SEND_MAX_PER_MINUTE` | Outbox rate limit per minute | `20` |
| `SEND_MAX_PER_HOUR` | Outbox rate limit per hour | `300` |
| `MAX_IMAGE_SIZE_MB` | Image upload limit | `16` |
| `MAX_VIDEO_SIZE_MB` | Video upload limit | `64` |
| `MAX_DOCUMENT_SIZE_MB` | Document upload limit | `100` |
| `MAX_AUDIO_SIZE_MB` | Audio upload limit | `16` |

### Frontend (`frontend/.env`)

| Variable | Description | Example Placeholder |
| :--- | :--- | :--- |
| `VITE_AUTH_ENABLED` | Enable authentication view | `false` |

---

## Usage Guide

### 1. Linking WhatsApp
1. Navigate to `http://localhost:5173`.
2. Click **Connect** to initialize the Baileys session and generate a QR code.
3. Open WhatsApp on your phone, go to **Settings > Linked Devices > Link a Device**, and scan the code.

### 2. Enabling AI Auto-Reply
- **Per-Chat**: Click the `[🤖 AI: OFF]` badge in any chat header to switch it to `[🤖 AI: ON]`.
- **Bulk Enable**: Go to **Settings > AI Auto-Responder** and click **Enable All 1-on-1 Chats**.
- **Configure Answers**: Update your bio, YouTube link, and Google Meet scheduling text in **Settings**.

### 3. Testing Auto-Replies
- **In-Chat Self-Test**: Send `/ai who are you` or `who are you` directly in your conversation.
- **Simulator**: Open **Settings**, navigate to **Auto-Reply Simulator**, and click any preset test chip.

---

## Testing

Run the automated backend test suite covering encryption, parsers, outbox queues, and AI intent matching:

```bash
cd backend
npm test
```

All 101 tests pass across 10 test suites in ~2 seconds.

---

## Anti-Ban Best Practices

1. **Warm Up New Numbers**: If using a newly registered SIM, keep messaging volume organic for the first 2–3 weeks before activating heavy automations.
2. **Never Message Strangers**: WhatsApp bans are predominantly triggered by recipients tapping **"Report and Block"**. Only converse with consented contacts.
3. **Respect Rate Limits**: Keep the Outbox jitter delays active (1.5s–3.5s minimum) and maintain reasonable daily caps.
4. For full guidelines, read [`docs/anti-ban.md`](docs/anti-ban.md).

---

## Troubleshooting & FAQ

- **QR Code times out**: Click **Disconnect** followed by **Connect** to refresh the QR code stanza.
- **Decryption / "Bad MAC" Error**: The platform includes automatic self-healing logic that clears corrupt Signal session keys and re-establishes ratchets automatically.
- **Port Conflict on 3000 or 5173**: Modify `PORT` in `backend/.env` or pass `--port` to Vite in `frontend/package.json`.

---

## Roadmap

- [ ] Multi-account session switcher in the sidebar.
- [ ] Scheduled message broadcasts with CSV recipient imports.
- [ ] Voice note transcription via local Whisper models.
- [ ] End-to-end encrypted chat backup exports.

---

## Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening pull requests.

---

## License

This project is licensed under the [MIT License](LICENSE) &copy; 2026 Ansh Verma.

---

## Important Legal Disclaimer

**This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp, Meta, or any of their subsidiaries or affiliates.** The official WhatsApp website can be found at [https://whatsapp.com](https://whatsapp.com).

This software uses an unofficial, reverse-engineered WhatsApp protocol implementation (`@whiskeysockets/baileys`). Using unofficial clients or automated messaging tools may violate WhatsApp's Terms of Service and can result in temporary or permanent suspension of your account. Use this software strictly for authorized personal productivity and research purposes. Never use this platform to send unsolicited spam or violate the privacy of others. The authors and contributors assume no liability for account suspensions or damages resulting from the use of this project.
