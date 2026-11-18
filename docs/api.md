# REST API Reference

The backend Fastify server exposes REST endpoints under `/api`. All endpoints use standard JSON request and response payloads.

---

## 1. Sessions (`/api/sessions`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions` | List all WhatsApp sessions and runtime statuses |
| `POST` | `/api/sessions` | Create a new session record |
| `POST` | `/api/sessions/:id/connect` | Initiate Baileys socket and generate QR code |
| `POST` | `/api/sessions/:id/pairing-code` | Request an 8-digit phone pairing code |
| `POST` | `/api/sessions/:id/disconnect` | Cleanly disconnect socket without wiping credentials |
| `POST` | `/api/sessions/:id/logout` | Disconnect and wipe credentials from database |
| `POST` | `/api/sessions/:id/reset` | Wipe credentials and trigger new QR flow |

---

## 2. Chats (`/api/sessions/:id/chats`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions/:id/chats` | Fetch paginated chat conversations with filters |
| `GET` | `/api/sessions/:id/chats/:jid` | Retrieve single chat metadata |
| `PATCH` | `/api/sessions/:id/chats/:jid/pin` | Pin or unpin a chat (max 3 pinned) |
| `PATCH` | `/api/sessions/:id/chats/:jid/archive` | Archive or unarchive a chat |
| `PATCH` | `/api/sessions/:id/chats/:jid/mute` | Mute chat notifications for duration |
| `PATCH` | `/api/sessions/:id/chats/:jid/unread` | Mark conversation as read / unread |

---

## 3. Messages (`/api/sessions/:id/chats/:jid/messages`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions/:id/chats/:jid/messages` | Fetch cursor-paginated messages for a chat |
| `POST` | `/api/sessions/:id/chats/:jid/messages` | Queue text message for sending via Outbox |
| `POST` | `/api/sessions/:id/chats/:jid/send/media` | Multipart media file upload (image, video, doc) |
| `POST` | `/api/sessions/:id/chats/:jid/send/voice` | Upload and convert voice note to Opus OGG |
| `POST` | `/api/sessions/:id/chats/:jid/messages/:mid/react` | Add or remove emoji reaction |
| `PATCH` | `/api/sessions/:id/chats/:jid/messages/:mid/edit` | Edit text message within 15 minutes |
| `DELETE` | `/api/sessions/:id/chats/:jid/messages/:mid` | Delete message for me or revoke for everyone |
| `POST` | `/api/sessions/:id/chats/:jid/messages/:mid/star` | Star or unstar a message |

---

## 4. AI Concierge & Automation (`/api/sessions/:id/ai`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions/:id/ai/config` | Retrieve session AI configuration and knowledge base |
| `PUT` | `/api/sessions/:id/ai/config` | Update bio, social URLs, cooldowns, and limits |
| `GET` | `/api/sessions/:id/ai/stats` | View 24-hour reply statistics and logs |
| `POST` | `/api/sessions/:id/ai/test` | Run the interactive simulator against a text prompt |
| `PATCH` | `/api/sessions/:id/chats/:jid/ai` | Toggle AI auto-reply for an individual chat |
| `POST` | `/api/sessions/:id/ai/enable-all` | Bulk enable AI auto-reply for all direct chats |
| `POST` | `/api/sessions/:id/ai/disable-all` | Bulk disable AI auto-reply for all chats |

---

## 5. Groups (`/api/sessions/:id/groups`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions/:id/groups/:jid` | Retrieve group subject, description, and participant roster |
| `POST` | `/api/sessions/:id/groups/:jid/participants` | Add, remove, promote, or demote participants |

---

## 6. Health & Diagnostics

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status and database connectivity |
