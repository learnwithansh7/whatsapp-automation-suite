# Custom WhatsApp Client (Web App) - Monorepo

A private, extensible WhatsApp Web client linked via Baileys with multi-account ready schema, AES-256-GCM database session storage, Socket.IO real-time QR pairing, Clean Light UI, persistent anti-ban send queue, voice notes via FFmpeg, and media viewing/downloading.

---

## Architecture Overview (Phase 3)

```
D:\whatsapp-client\
├── backend\
│   ├── prisma\             # Prisma Schema (Outbox, Message, Chat, Contact, Session)
│   ├── storage\
│   │   └── media\          # Local media files: /storage/media/{sessionId}/{uuid}{ext}
│   ├── src\
│   │   ├── config\         # Zod validated env vars & anti-ban / media thresholds
│   │   ├── routes\         # REST API routes (messages, media stream, chats, sessions, contacts)
│   │   ├── services\       # Outbox queue, Media storage, Mime detector, Voice converter, Thumbnails
│   │   └── whatsapp\       # Baileys session manager, name resolver, avatar queue, merge service
├── frontend\               # React 18 + Vite + Tailwind CSS (Clean Light) + TanStack Query + Zustand
│   ├── src\components\chat # MessageBubble, MessageInput, MediaLightbox, AudioPlayer
├── ai-service\             # Python FastAPI placeholder (Phase 4+)
├── infra\                  # docker-compose.yml (PostgreSQL + Redis optional infra config)
├── .env.example            # Documented environment variables template
├── .gitignore              # Git ignore rules ensuring no secrets, credentials, or media are tracked
└── README.md               # Setup, operational guide, and test checklists
```

---

## Prerequisites

1. **Node.js**: `v20.0.0` or newer LTS (tested with Node `22.x`)
2. **Package Manager**: `npm` (tested with `10.9.x`)
3. **PostgreSQL**: Native PostgreSQL 16 (or Docker container) running on port `5432`
4. **Redis**: Optional (Send queue runs on PostgreSQL Outbox table with `ISendQueue` interface; drop-in ready for BullMQ)
5. **FFmpeg**: Automatically provided via `ffmpeg-static` (cross-platform binary including Windows `ffmpeg.exe`)

---

## Environment Variables (`backend/.env`)

Ensure `backend/.env` has the following variables populated:

```env
NODE_ENV=development
PORT=3000
HOST=127.0.0.1

# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:<PASSWORD>@localhost:5432/whatsapp_client?schema=public"

# 32-byte AES-256-GCM encryption key (Base64)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY="your_base64_encoded_32_byte_key_here="

# JWT Secret for dashboard session cookies
JWT_SECRET="your_secure_jwt_secret_here"

# Auth toggle (false for local dev single-user mode)
AUTH_ENABLED=false

# ---------------------------------------------------------------------------
# Phase 3: Anti-Ban & Sending Rate Limits
# ---------------------------------------------------------------------------
# Jitter delay between consecutive message sends (ms)
SEND_MIN_DELAY_MS=1500
SEND_MAX_DELAY_MS=3500

# Rate limits (sliding window)
SEND_MAX_PER_MINUTE=20
SEND_MAX_PER_HOUR=300

# ---------------------------------------------------------------------------
# Phase 3: Media File Size Limits (MB)
# ---------------------------------------------------------------------------
MAX_IMAGE_SIZE_MB=16
MAX_VIDEO_SIZE_MB=64
MAX_DOCUMENT_SIZE_MB=100
MAX_AUDIO_SIZE_MB=16
AUTO_DOWNLOAD_VIDEO_MAX_MB=15

# Default read receipts behavior (true = blue ticks sent to WhatsApp; false = local read only)
SEND_READ_RECEIPTS=false
```

---

## First-Time Setup & Migrations

```powershell
# In D:\whatsapp-client\backend
npm run prisma:migrate
```

---

## Running the Application

Open two PowerShell terminals:

### Terminal 1: Backend API (Port 3000)
```powershell
cd D:\whatsapp-client\backend
npm run dev
```
*Health endpoint live at: [http://localhost:3000/api/health](http://localhost:3000/api/health)*

### Terminal 2: Frontend Web App (Port 5173)
```powershell
cd D:\whatsapp-client\frontend
npm run dev
```
*Web dashboard live at: [http://localhost:5173](http://localhost:5173)*

---

## Running Automated Tests

```powershell
cd D:\whatsapp-client\backend
npm test -- --run
```
*Executes 73 unit tests across 8 test suites covering AES-256-GCM encryption, Baileys event parsing, disconnect handling, name resolution, contact merging, magic bytes MIME detection, Outbox queue anti-ban algorithms, and Phase 4A Groups & Message Actions.*

---

## Phase 4A Features (Groups & Message Actions)

### 1. Group Chats
- **Group Metadata Sync**: Synchronizes subject, description, owner, creation date, announce-only (`announceOnly`), and restriction policies on connect and live updates (`groups.upsert`, `groups.update`).
- **Participant Roster & Admin Status**: Tracks all members with admin / superadmin badges, phone numbers, and profile pictures. Reconciled in real-time via `group-participants.update`.
- **Announce-Only Protection**: If a group is announce-only (`announceOnly === true`) and the user is not an admin, message input is disabled with a clear explanation and sending is rejected at the API level (403 `ANNOUNCE_ONLY`).
- **Group Mentions (`@`)**: Typing `@` triggers an autocomplete dropdown of group participants. Messages are sent with `contextInfo: { mentionedJid: [...] }` and rendered as highlighted mention pills.
- **Group Sender Identity**: Each group participant's message displays an avatar, formatted contact/phone name, and a consistent deterministic color.

### 2. Message Actions & Anti-Ban Rate Limiting
All outgoing actions are enqueued into PostgreSQL `Outbox` table and processed with human-like jitter delays and sliding-window rate limits:
- **Reactions**: 6 quick emoji shortcuts (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`) plus custom emoji picker. Grouped reactions bar displays under each bubble with tap-to-remove.
- **Reply**: Quotes the original message with an inline preview and jumps to the referenced message.
- **Copy**: One-click clipboard copy of message text or caption.
- **Forward**: Forward dialog allowing multi-select up to 5 chats with search. Sent with WhatsApp standard forwarding context.
- **Star / Unstar**: Bookmark messages for quick retrieval. Global Starred Messages modal (`StarredMessagesModal`) with direct jump-to-chat.
- **Edit Message**: Allows editing own text messages within 15 minutes. Shows "Edited" indicator with timestamp and stores original text. Up-Arrow in the input box automatically triggers editing the last sent message.
- **Delete for Me**: Instantly hides the message locally without affecting other participants.
- **Delete for Everyone**: Revokes message from WhatsApp within the ~48-hour protocol window. Displays placeholder `You deleted this message` / `This message was deleted`.
- **Anti-Revoke (Preserve Deleted Messages)**: When another person sends a message or media and deletes it for everyone (`REVOKE`), the client preserves the original content, photo, or audio file and displays an explicit banner: `🚫 Deleted by sender at [hh:mm]` with a subtle rose highlight. Can be toggled on/off in **Settings**.

### 3. Baileys Supported vs Unsupported Protocol Limitations
| Feature | Supported via Baileys 6.7.24 | Protocol Restriction / Limitation |
| :--- | :--- | :--- |
| **Reactions** | ✅ `sock.sendMessage(jid, { react: { text, key } })` | Empty text `""` removes existing reaction. |
| **Delete for Everyone** | ✅ `sock.sendMessage(jid, { delete: key })` | Own messages only; WhatsApp rejects revoke older than ~48h. |
| **Edit Message** | ✅ `sock.sendMessage(jid, { text, edit: key })` | Text messages only; strictly within 15 minutes of sending. Media captions cannot be edited on WhatsApp protocol. |
| **Forward Message** | ✅ `sock.sendMessage(jid, { forward: msg, contextInfo })` | Max 5 chats per forward as per WhatsApp anti-spam rules. |
| **Star / Unstar** | ✅ `sock.star(jid, [{ id, fromMe }], boolean)` | Synced via Baileys app patch (`chatModify.star`). |
| **Mentions** | ✅ `contextInfo: { mentionedJid: [...] }` | Recipient client highlights JIDs listed in `mentionedJid`. |
| **Announce-Only** | ✅ `groupMetadata.announce` | Non-admin sends are rejected by WhatsApp servers. |

---

## Phase 3 Features

### 1. Persistent Outbox Queue & Anti-Ban Safety
- Messages are saved directly to the PostgreSQL `Outbox` table with status `pending`.
- Outbox worker picks messages FIFO per session with safe human-like behavior:
  - **Random Jitter Delay**: 1.5s to 3.5s delay between messages.
  - **Composing Presence**: Sends `composing` typing state before sending text (proportional to message length, max 4s).
  - **Rate Limits**: Enforces 20 messages/minute and 300 messages/hour. Emits `queue.ratelimit` warnings to frontend.
  - **Automatic Retries**: Up to 2 retries on transient network failures with exponential backoff (10s, 30s) before marking as `failed`.
  - **Queue Pause on Disconnect**: Automatically pauses processing when WhatsApp disconnects, resumes on reconnection.

### 2. Rich Media Sending & Receiving
- **Images & Videos**: Supported with client-side drag-and-drop, clipboard paste, caption support, inline preview, and full-screen lightbox viewer (`MediaLightbox`).
- **Voice Notes (PTT)**:
  - Recorded directly in browser using Web Audio / MediaRecorder.
  - Converted server-side via bundled `ffmpeg-static` to WhatsApp-compatible OGG/Opus mono 16 kHz.
  - Sent with `ptt: true` and synthetic waveform bars.
  - Custom audio player (`AudioPlayer`) with duration formatting, playback controls, and scrub bar.
- **Documents & Audio**: Dedicated attachment options with file size checks, extension/MIME validation, and download links.

### 3. Read Receipts Control
- Toggle in **Settings** (`Send Read Receipts (Blue Ticks)`).
- When OFF (default): Reading a chat marks messages read locally in PostgreSQL without sending read receipts back to WhatsApp.
- When ON: Sends `readMessages` update to WhatsApp via Baileys, updating blue ticks for the sender.

---

## Phase 4B Features (Chat List Tools, Info Panel & Polish)

### 1. Chat List Organization & Actions
- **Pin Chats**: Pin up to 3 priority conversations to the top of the chat list. Synced with phone via Baileys `sock.chatModify({ pin: true }, jid)`. Enforces strict max 3 validation with toast alert.
- **Archive Chats**: Archive conversations to separate them from active chats. Synced with phone via `sock.chatModify({ archive: true }, jid)`. Features quick "Undo" action toast.
- **Mute Notifications**: Mute chats for **8 Hours**, **1 Week**, or **Always**. Synced with phone via `sock.chatModify({ mute: timestamp }, jid)`. Muted badge uses subtle grey styling.
- **Mark as Unread**: Mark any chat unread with a green dot badge. Clearly tagged with a `Local only` indicator in the context menu and info panel.
- **Filter Tabs**: Instant filtering by **All**, **Unread**, **Groups**, and **Archived** with unread count badges dynamically calculated per tab.
- **Archived View**: Dedicated view with back arrow to return to active conversations.
- **Context Menu**: Accessible via right-click on any chat row or hovering over the 3-dot action button.
- **Layout Density**: Switch between **Comfortable** (default 44px avatars, generous padding) and **Compact** (36px avatars, condensed row spacing for power users).

### 2. Contact & Group Info Panel
- Click chat header or info icon (`i`) to slide open the side info drawer.
- **Contact Details**: High-resolution avatar, phone number with one-click copy, verified business badge, and About status text (lazily fetched via `sock.fetchStatus` and cached for 7 days).
- **Group Details**: Group subject, description, creation date, admin roster, and member participant count.
- **Shared Media Explorer** (with cursor pagination and skeleton loaders):
  - **Media Grid**: Visual 3-column photo and video thumbnails with direct click-to-lightbox viewer.
  - **Docs List**: List of shared documents and PDFs with file size and timestamp.
  - **Links List**: URLs shared in the conversation paired with SSRF-safe rich link preview cards.
  - **Starred Messages**: Bookmarked messages with 1-click jump-to-chat.

### 3. SSRF-Safe Link Previews
- Automatic server-side OpenGraph and metadata extraction for URLs shared in messages.
- **SSRF Defense**:
  - Resolves domain via DNS and strictly blocks IPv4 private/loopback/carrier-grade ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`) and IPv6 loopback/unique-local/link-local (`::1`, `fe80::`, `fc00::`).
  - 5-second connection timeout, max 3 redirects, and 1 MB streaming download cap.
  - Cached for 7 days in PostgreSQL `LinkPreview` table and image assets saved to `storage/previews/`.
  - Rate-limited to max 1 preview fetch per 2 seconds.

### 4. Settings View & Preferences
- **Appearance**:
  - Theme: **Clean Light**, **Dark Mode**, or **System** (respects `prefers-color-scheme`).
  - Chat List Density: **Comfortable** vs **Compact**.
  - Chat Wallpaper: **Plain** (solid neutral), **Subtle Pattern** (WhatsApp doodle), or **Soft Tint** (emerald undertone).
- **Chat Behavior**:
  - **Enter to Send**: Toggle between Enter-sends vs Shift+Enter-sends (multiline default).
  - **Send Read Receipts**: Default OFF.
  - **Show Link Previews**: Toggle rendering of rich preview cards.
  - **Anti-Revoke**: Keep deleted messages.
- **Account Connection**:
  - Linked phone number, connection state badge, and direct button to Connection view.
- **About & Storage**:
  - Versions: App version `0.4.2`, pinned Baileys engine `6.7.24`, Node.js runtime.
  - Storage breakdown: Media files (MB), Profile avatars (MB), Link preview images (MB), Outbox queue size.
  - **Clear Cache Action**: One-click cleanup of cached avatars and link previews without affecting messages or media.

### 5. Keyboard Navigation (`?`)
- Press `?` anywhere to open the shortcuts cheat sheet modal.
- `Esc`: Close open modal, lightbox, context menu, or cancel reply/edit.
- `Ctrl + Shift + P`: Toggle pin on active chat.
- `Ctrl + Shift + A`: Toggle archive on active chat.
- `↑` / `↓`: Navigate up and down across the chat list.
- `Enter`: Select focused chat from list.
- `Shift + Enter`: New line in message input.

### 6. WhatsApp Sync vs Local Only Status Matrix
| Action | Syncs with Phone? | Baileys Implementation | UI Indication |
| :--- | :---: | :--- | :--- |
| **Pin / Unpin** | ✅ Yes (Max 3) | `sock.chatModify({ pin: boolean }, jid)` | Pin icon; rejects > 3 with toast |
| **Archive / Unarchive** | ✅ Yes | `sock.chatModify({ archive: boolean, lastMessages }, jid)` | Filtered to Archived tab; Undo toast |
| **Mute / Unmute** | ✅ Yes | `sock.chatModify({ mute: number \| null }, jid)` | Mute icon; grey badge styling |
| **Mark as Unread** | ⚠️ Local Only | Stored in PostgreSQL `markedUnread`; attempted app-state sync | Green dot badge; labeled `Local only` |
| **Contact About Status** | ✅ Yes | `sock.fetchStatus(jid)` via USyncQuery | Rendered in Info Panel with 7d cache |

---

## Phase 5 Features (AI Auto-Reply & Anti-Ban Concierge)

### 1. Anti-Ban Human Simulation Pipeline
- **10-Second Human Reading Delay**: When a message arrives in an AI-enabled chat, the bot pauses for **8 to 14 seconds (randomized jitter centered around ~10s)** before taking action, simulating a real person picking up their phone and reading.
- **Dynamic Typing Simulation**: Sends `sock.sendPresenceUpdate('composing', chatJid)` and keeps it active for **2.5 to 6.5 seconds** proportional to message length (~40 WPM), then switches to `paused`.
- **Manual Reply Cancellation**: If the user sends a manual message from their phone (`fromMe === true`) while the 10-second timer is pending, the auto-reply is **aborted immediately** to avoid awkward double-replies.
- **Outbox Queue Routing**: All generated messages pass through the existing PostgreSQL `Outbox` queue with anti-ban sliding-window rate limits (max 20/min, 300/hour).

### 2. Zero-API Intent & Profile Matcher
Requires **no external API keys**, costs $0, has zero downtime risk, and never hallucinates:
- **Developer & YouTuber Bio**: When asked *"Who are you?"*, *"What do you do?"*, *"Aap kaun ho?"*, or *"Introduce yourself"*, answers with your customized developer bio, YouTube channel link, and subscriber milestone.
- **YouTube & Subscriber Stats**: When asked for *"yt link"*, *"channel link"*, *"how many subs"*, answers with your direct YouTube URL and current subscriber count.
- **Google Meet & Call Scheduling**: When asked *"Can we book a Google Meet?"*, *"Let's have a call"*, answers with your custom scheduling message (*"Wait, let me check my schedule and I will get back to you shortly with an available time slot!"*).
- **Instagram & Socials**: Answers queries asking for your Instagram or social media profiles.
- **Polite Away Fallback**: For complex or out-of-scope inquiries, politely informs the sender that you are away from your desk and will reply personally soon.

### 3. Safety Guardrails & Controls
- **Specific Chats Only**: Disabled globally by default. You selectively activate AI auto-reply on specific 1-on-1 chats via the `AI: ON / OFF` pill in the chat header, the context menu, or the Contact Info drawer.
- **Strict Group Protection**: AI auto-replies are **permanently disabled in group chats (`@g.us`)** and broadcast channels.
- **Per-Contact Cooldown**: Enforces a 20-minute cooldown (configurable in Settings) so contacts cannot spam or loop the auto-reply.
- **Daily Volume Cap**: Enforces a strict daily limit (default 50 replies/24h) to stay well under WhatsApp abuse thresholds.
- **Settings UI**: Complete knowledge base editor in Settings to customize your bio, YouTube link, subscriber count, Instagram handle, and delay parameters.
