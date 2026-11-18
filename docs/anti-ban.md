# Anti-Ban Guidelines & Protection Engineering

Automating WhatsApp communications carries strict operational risks. WhatsApp utilizes automated machine learning models and server-side heuristics to detect and ban accounts exhibiting unnatural patterns. This guide details how this client safeguards your account and provides operational best practices.

---

## 1. Built-In Safeguards

This platform incorporates multiple architectural layers specifically engineered to prevent account bans:

### A. The Persistent Outbox Queue
All outgoing messages (manual messages, media uploads, AI auto-replies, emoji reactions, and edits) pass through `sendQueue.ts`.
- **Sequential Execution**: Messages are dispatched sequentially per session rather than in concurrent bursts.
- **Randomized Jitter Delays**: A randomized delay of **1.5 to 3.5 seconds** is enforced between every outgoing message.
- **Sliding-Window Rate Limits**: Capped at **20 messages per minute** and **300 messages per hour**. If limits are approached, the queue automatically pauses.

### B. Natural Human Reading & Typing Simulation
When the AI concierge processes an incoming message:
- **Reading Delay**: The engine waits **8 to 14 seconds** before initiating a response, mimicking human reading comprehension time.
- **Typing Presence (`composing`)**: The engine sends a WhatsApp presence update indicating that the user is typing for **2.5 to 6.5 seconds** (proportional to message length).
- **Auto-Cancellation**: If you manually send a reply from your mobile phone while an automated reply is queued, the engine immediately cancels the pending auto-reply.

### C. Channel & Group Exclusions
- **Group Chats (`@g.us`)**: Permanently excluded from auto-reply to prevent unintended spam or message loops.
- **Newsletters & Channels (`@newsletter`)**: Permanently excluded.
- **Broadcast Lists (`@broadcast`)**: Excluded.

---

## 2. Best Practices for Number Safety

### 1. Warming Up New Numbers
Never connect a brand-new WhatsApp account and immediately trigger high-volume automation.
- **Days 1–7**: Use the number for organic, 1-on-1 human conversations. Keep automated volume under 10 messages/day.
- **Weeks 2–3**: Gradually increase volume. Keep AI daily limit capped at 30–50 messages.
- **Week 4+**: Maintain steady conversational volume. Avoid sudden spikes.

### 2. Recipient Consent
- Only message contacts who expect your message or have messaged you first.
- The highest cause of WhatsApp account bans is recipients pressing the **"Report and Block"** button. If even 2–3 recipients report your account within a short window, automated restrictions will trigger.

### 3. Content Variation
- Avoid sending identical messages to multiple people in rapid succession.
- Use personalized placeholders and conversational phrasing.
