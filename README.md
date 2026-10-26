# Custom WhatsApp Client (Web App) - Monorepo

A private, extensible WhatsApp Web client linked via Baileys with multi-account ready schema, AES-256-GCM database session storage, Socket.IO real-time QR pairing, and Clean Light UI.

---

## Architecture Overview (Phase 1)

```
D:\whatsapp-client\
├── backend\       # Fastify API + Baileys Session Manager + Prisma ORM + Socket.IO
├── frontend\      # React 18 + Vite + Tailwind CSS (Clean Light) + TanStack Query + Zustand
├── ai-service\    # Python FastAPI placeholder (Phase 4+)
├── infra\         # docker-compose.yml (PostgreSQL + Redis optional infra config)
├── .env.example   # Documented environment variables template
├── .gitignore     # Git ignore rules ensuring no secrets or credentials are tracked
└── README.md      # Setup, operational guide, and test checklists
```

---

## Prerequisites

1. **Node.js**: `v20.0.0` or newer LTS (tested with Node `22.x`)
2. **Package Manager**: `npm` (tested with `10.9.x`)
3. **PostgreSQL**: Native PostgreSQL 16 (or Docker container) running on port `5432`
4. **Redis**: Optional in Phase 0/1 (will be utilized with BullMQ in Phase 3)

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
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET="your_secure_jwt_secret_here"
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
*Health endpoint live at: [http://localhost:3000/health](http://localhost:3000/health)*

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
npm test
```
*Executes 10 unit tests covering AES-256-GCM round-tripping & tampering detection, Baileys disconnect reason classification, and exponential backoff calculations.*

---

## How to Connect WhatsApp

1. Open [http://localhost:5173](http://localhost:5173).
2. On first visit, register your administrator account.
3. Navigate to **WhatsApp Linked Device** (QR icon on sidebar).
4. Click **Connect WhatsApp**:
   - The backend initializes the Baileys session socket and emits a live QR code via Socket.IO.
   - Open WhatsApp on your phone: **Settings > Linked Devices > Link a Device**.
   - Point your phone camera at the QR code on screen.
5. Once paired:
   - Status badge turns green (`Connected`).
   - Phone number displays on screen.
   - All session credentials and signal keys are encrypted in PostgreSQL via AES-256-GCM.
6. **Backend Restart Test**:
   - Stop the backend server and start it again.
   - The backend auto-starts existing sessions from the database and reconnects **without needing a new QR code**.
