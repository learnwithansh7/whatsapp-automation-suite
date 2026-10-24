# Custom WhatsApp Client (Web App) - Monorepo

A private, extensible WhatsApp Web client linked via Baileys with multi-account support, scheduled messages, CRM tags, AI chat replies, and anti-delete features.

---

## Architecture Overview (Phase 0)

```
D:\whatsapp-client\
├── backend\       # Fastify + TypeScript (strict) + Prisma ORM + Zod
├── frontend\      # React 18 + Vite + Tailwind CSS + TanStack Query + Zustand
├── ai-service\    # Python FastAPI placeholder (Phase 4+)
├── infra\         # docker-compose.yml (PostgreSQL + Redis optional infra config)
├── .env.example   # Documented environment variables template
├── .gitignore     # Git ignore rules ensuring no secrets or node_modules are tracked
└── README.md      # Setup, operational guide, and test checklists
```

---

## Prerequisites

1. **Node.js**: `v20.0.0` or newer LTS (tested with Node `22.x`)
2. **Package Manager**: `npm` (tested with `10.9.x`)
3. **PostgreSQL**: Native PostgreSQL 16 (or Docker container) running on port `5432`
4. **Redis**: Optional in Phase 0 (will be utilized with BullMQ in Phase 3)

---

## First-Time Setup

### 1. Configure Backend Environment
Copy `.env.example` into `backend/.env` (already prepared on this machine):
```bash
# In D:\whatsapp-client\backend
cp ../.env.example .env
```
Ensure `backend/.env` has your valid PostgreSQL credentials:
```env
DATABASE_URL="postgresql://postgres:<PASSWORD>@localhost:5432/whatsapp_client?schema=public"
```

### 2. Generate Prisma Client & Run Database Migration
Once PostgreSQL is running and the database `whatsapp_client` is created:
```bash
cd D:\whatsapp-client\backend
npm run prisma:migrate -- --name init
```

To inspect your database schema and tables visually at any time:
```bash
npm run prisma:studio
```

---

## Running the Application

Open two PowerShell terminals:

### Terminal 1: Backend API (Port 3000)
```powershell
cd D:\whatsapp-client\backend
npm run dev
```
*Health endpoint will be live at: [http://localhost:3000/health](http://localhost:3000/health)*

### Terminal 2: Frontend Web App (Port 5173)
```powershell
cd D:\whatsapp-client\frontend
npm run dev
```
*Frontend will be live at: [http://localhost:5173](http://localhost:5173)*

The Vite dev server automatically proxies `/api/*` and `/health` requests to `http://localhost:3000`, eliminating CORS issues during development.

---

## Testing `/health`

You can verify the system health via cURL, PowerShell, or browser:

```powershell
# In PowerShell:
curl http://localhost:3000/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "uptime": 42,
  "timestamp": "2026-10-24T10:30:00.000Z",
  "responseTimeMs": 3,
  "services": {
    "backend": "ok",
    "database": {
      "status": "connected",
      "latencyMs": 2,
      "error": null
    },
    "redis": {
      "status": "not configured"
    }
  }
}
```

---

## Quality Checks & Linting

```powershell
# Backend lint
cd D:\whatsapp-client\backend
npm run lint

# Frontend lint
cd D:\whatsapp-client\frontend
npm run lint
```
