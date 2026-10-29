// Everything lives in memory. Restarting the server wipes all rooms, QR codes and files.
export const users = new Map();     // socket.id -> { id, name, roomId, createdAt }
export const qrTokens = new Map();  // token -> { ownerId, expiresAt }
export const rooms = new Map();     // roomId -> { id, members: [socketId, socketId] }
export const transfers = new Map(); // transferId -> transfer (see socketHandlers.js)
export const onlineAccounts = new Map(); // lowercaseUsername -> Set<socket.id>

export const FINAL = new Set(['ready', 'rejected', 'cancelled', 'failed', 'expired']);
export const IN_FLIGHT = new Set(['offered', 'accepted', 'uploading']);

export function storedBytes() {
  let n = 0;
  for (const t of transfers.values()) if (t.status !== 'rejected' && t.status !== 'cancelled' && t.status !== 'failed') n += t.size;
  return n;
}
