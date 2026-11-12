# Contributing Guidelines

Thank you for your interest in contributing to the WhatsApp Client project!

---

## Code of Conduct

Please be respectful, collaborative, and considerate of others when participating in issues and pull requests.

---

## Development Setup

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/<your-username>/whatsapp-client.git
   cd whatsapp-client
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env to set your DATABASE_URL and generate an ENCRYPTION_KEY:
   # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npx prisma migrate dev
   npm run dev
   ```

3. **Frontend Setup**:
   ```bash
   cd ../frontend
   npm install
   cp .env.example .env
   npm run dev
   ```

---

## Testing & Quality Assurance

Before submitting a Pull Request, ensure that all test suites pass and that TypeScript builds cleanly without errors:

```bash
# In backend/
npm test -- --run     # Run 100+ unit test suite
npm run build         # Verify TypeScript compilation (tsc)
npm run lint          # Run ESLint

# In frontend/
npm run build         # Verify TypeScript compilation & Vite bundle
npm run lint          # Run ESLint
```

---

## Git Conventions

- **Branch Naming**:
  - `feat/<feature-name>` for new features
  - `fix/<bug-name>` for bug fixes
  - `docs/<doc-name>` for documentation updates
- **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat: add voice note playback scrubber`
  - `fix: prevent rate-limit queue stall on reconnect`
  - `docs: update setup steps in README`
  - `test: add unit tests for LID-to-Phone migration`

---

## Anti-Ban & WhatsApp Compliance Note

All features that send data or interact with WhatsApp servers **must** adhere to the project's anti-ban principles:
- Outgoing actions must be routed through `sendQueue.ts` (with human jitter and rate limits).
- Automated replies must simulate realistic human typing delays and be disabled for group chats.
- Never implement bulk messaging or spam tooling.
