import { io } from 'socket.io-client';

const TARGET_USERNAME = process.argv[2] || 'alice_test';
const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;

async function dropFile(senderName, fileName, buffer) {
  const socket = io(BASE, { transports: ['websocket'] });
  await new Promise((resolve) => socket.once('connect', resolve));

  await new Promise((resolve) => socket.emit('session:start', { name: senderName }, resolve));

  const offerRes = await new Promise((resolve) => {
    socket.emit('drop:offer', {
      toUsername: TARGET_USERNAME,
      name: fileName,
      size: buffer.length,
      senderName,
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
