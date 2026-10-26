import { io } from 'socket.io-client';

const TARGET_USERNAME = process.argv[2] || 'alice_test';
const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;

async function dropFile(senderName, fileName, buffer) {
  const username = senderName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16);
  const pin = '0427'; // 4-digit PIN with leading zero!

  // Ensure sender has an account
  let authUser = null;
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', pin, confirmPin: pin, displayName: senderName }),
  }).catch(() => null);

  if (regRes && regRes.ok) {
    const regData = await regRes.json();
    authUser = regData.user;
  } else {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password123' }),
    }).catch(() => null);
    if (loginRes && loginRes.ok) {
      const loginData = await loginRes.json();
      authUser = loginData.user;
    }
  }

  // Obtain single-use 4-digit Send PIN authorization
  let sendAuthToken = null;
  if (authUser) {
    const pinRes = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': authUser.username,
        'x-auth-token': authUser.token,
      },
      body: JSON.stringify({ pin, recipient: TARGET_USERNAME, fileCount: 1 }),
    }).catch(() => null);

    if (pinRes && pinRes.ok) {
      const pinData = await pinRes.json();
      sendAuthToken = pinData.sendAuthToken;
    }
  }

  const socket = io(BASE, { transports: ['websocket'] });
  await new Promise((resolve) => socket.once('connect', resolve));

  await new Promise((resolve) => socket.emit('session:start', {
    name: senderName,
    username: authUser?.username,
    token: authUser?.token,
  }, resolve));

  const offerRes = await new Promise((resolve) => {
    socket.emit('drop:offer', {
      toUsername: TARGET_USERNAME,
      name: fileName,
      size: buffer.length,
      senderName,
      sendAuthToken,
      pin: !sendAuthToken ? pin : undefined,
    }, resolve);
  });

  if (!offerRes.ok) {
    console.error('Offer failed:', offerRes.error);
    socket.disconnect();
    return;
  }

  const transferId = offerRes.id;
  await new Promise((resolve) => {
    socket.emit('file:chunk', { id: transferId, offset: 0, data: buffer }, resolve);
  });

  await new Promise((resolve) => {
    socket.emit('file:complete', { id: transferId }, resolve);
  });

  console.log(`✓ Sent ${fileName} from ${senderName} to @${TARGET_USERNAME}`);
  socket.disconnect();
}

// 1x1 transparent PNG buffer
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const SAMPLE_DOC = Buffer.from('Documay sample test content for document transfer verification.');

console.log(`Seeding sample drops for user: @${TARGET_USERNAME}...`);
await dropFile('Sarah Jenkins', 'project_roadmap.pdf', SAMPLE_DOC);
await dropFile('Sarah Jenkins', 'team_portrait.png', TINY_PNG);
await dropFile('David Miller', 'signed_agreement.docx', SAMPLE_DOC);
await dropFile('Elena Rostova', 'financial_forecast_q4.xlsx', SAMPLE_DOC);
console.log('Done seeding multiple senders!');
