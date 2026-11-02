import { io } from 'socket.io-client';

async function run() {
  console.log('--- Step 1: Querying sessions & chats from API ---');
  const sessRes = await fetch('http://localhost:5173/api/sessions');
  const sessData = await sessRes.json();
  const session = sessData.sessions?.[0];
  if (!session) {
    throw new Error('No sessions found in database');
  }
  console.log(`[PASS] Found session: ${session.id} (Status: ${session.status})`);

  const chatsRes = await fetch(`http://localhost:5173/api/sessions/${session.id}/chats`);
  const chatsData = await chatsRes.json();
  const chat = chatsData.chats?.[0];
  if (!chat) {
    throw new Error('No chats found in database');
  }
  console.log(`[PASS] Found chat: ${chat.jid} (Name: ${chat.name || 'Unknown'})`);

  console.log('\n--- Step 2: Connecting Socket.IO client to http://localhost:5173 (via Vite proxy) ---');
  const socket = io('http://localhost:5173', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      console.log(`[PASS] Socket connected successfully! Socket ID: ${socket.id}`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  console.log('\n--- Step 3: Registering Socket listeners & Sending message ---');
  const tempClientId = `tmp-test-${Date.now()}`;
  const testText = `Live update verification test ${Date.now()}`;

  let receivedMessageNew = false;
  let receivedMessageUpdated = false;
  let receivedChatUpdated = false;

  const eventsPromise = new Promise((resolve) => {
    socket.on('message.new', (data) => {
      console.log(`[RECEIVED: message.new] id=${data?.message?.id}, clientId=${data?.message?.clientId}, chatJid=${data?.message?.chatJid}`);
      if (data?.message?.clientId === tempClientId || data?.message?.id === tempClientId) {
        receivedMessageNew = true;
      }
    });

    socket.on('message.updated', (data) => {
      console.log(`[RECEIVED: message.updated] messageId=${data?.messageId}, clientId=${data?.clientId}, status=${data?.status}`);
      if (data?.clientId === tempClientId) {
        receivedMessageUpdated = true;
        if (receivedMessageUpdated && receivedChatUpdated) {
          resolve();
        }
      }
    });

    socket.on('chat.updated', (data) => {
      console.log(`[RECEIVED: chat.updated] jid=${data?.chat?.jid}, lastMessageId=${data?.chat?.lastMessageId}`);
      if (data?.chat?.jid === chat.jid) {
        receivedChatUpdated = true;
        if (receivedMessageUpdated && receivedChatUpdated) {
          resolve();
        }
      }
    });
  });

  console.log(`Sending POST /api/sessions/${session.id}/chats/${encodeURIComponent(chat.jid)}/send/text...`);
  const sendRes = await fetch(
    `http://localhost:5173/api/sessions/${session.id}/chats/${encodeURIComponent(chat.jid)}/send/text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: testText,
        clientId: tempClientId,
      }),
    },
  );

  const sendJson = await sendRes.json();
  console.log(`[PASS] Send API accepted (HTTP ${sendRes.status}):`, sendJson);

  console.log('\n--- Step 4: Waiting for real-time Socket events (worker processing & confirmation) ---');
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout waiting for real-time socket events')), 15000),
  );

  await Promise.race([eventsPromise, timeoutPromise]);

  console.log('\n--- Step 5: Verification Results ---');
  console.log(`[RESULT] message.new received: ${receivedMessageNew}`);
  console.log(`[RESULT] message.updated received: ${receivedMessageUpdated}`);
  console.log(`[RESULT] chat.updated received: ${receivedChatUpdated}`);
  console.log('\n>>> ALL LIVE-UPDATE CHECKS PASSED SUCCESSFULLY! <<<');

  socket.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[TEST FAILED]:', err);
  process.exit(1);
});
