import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { parseToken, validateFile } from '../utils/files';

export const SERVER = import.meta.env.VITE_SERVER_URL || ''; // empty = same origin (dev proxy / production)
const CHUNK = 512 * 1024;
const FINISHED = ['rejected', 'cancelled', 'failed', 'expired'];

/**
 * All real-time logic lives here: connection, QR pairing, consent and chunked uploads.
 * Components only render what this hook returns.
 */
export function useDocumay(name, notify) {
  const socketRef = useRef(null);
  const files = useRef(new Map());     // transferId -> File waiting to be streamed
  const stopped = useRef(new Set());   // transfers that were rejected / cancelled
  const queue = useRef(Promise.resolve());
  const nameRef = useRef(name);
  const notifyRef = useRef(notify);
  const roomRef = useRef(null);
  nameRef.current = name;
  notifyRef.current = notify;

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);   // { id, peer:{id,name}, role, peerOnline }
  const [items, setItems] = useState([]);   // every file card in the current room
  const [qr, setQr] = useState(null);       // { token, link, expiresAt }
  roomRef.current = room;

  const patch = useCallback((id, fields) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...fields } : i))), []);

  const call = useCallback((event, payload = {}) => new Promise((resolve) => {
    const s = socketRef.current;
    if (!s?.connected) return resolve({ ok: false, error: 'You’re offline. Reconnecting…' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'The server took too long to answer.' }), 30000);
    s.emit(event, payload, (res) => { clearTimeout(timer); resolve(res || { ok: false, error: 'No response from the server.' }); });
  }), []);

  /* Streams one accepted file to the server in 512 KB chunks; the server relays progress to both phones. */
  const upload = useCallback(async (id) => {
    const file = files.current.get(id);
    if (!file) return;
    const abort = async (msg) => {
      if (stopped.current.has(id)) return;
      patch(id, { status: 'failed' });
      notifyRef.current(msg);
      await call('file:cancel', { id });
    };
    let offset = 0;
    while (offset < file.size) {
      if (stopped.current.has(id)) return;
      const data = await file.slice(offset, offset + CHUNK).arrayBuffer();
      const res = await call('file:chunk', { id, offset, data });
      if (!res.ok) return abort(res.error);
      offset += data.byteLength;
    }
    const done = await call('file:complete', { id });
    if (!done.ok) return abort(done.error);
    files.current.delete(id);
  }, [call, patch]);

  useEffect(() => {
    if (!name) return undefined;
    const socket = io(SERVER, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('session:start', { name }, (res) => {
        if (res?.ok) setConnected(true); else notifyRef.current(res?.error || 'Could not start your session.');
      });
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setRoom((r) => (r ? { ...r, peerOnline: false } : r)); // the server forgets rooms when a socket drops
    });
    socket.on('connect_error', () => notifyRef.current('Can’t reach the Documay server.'));

    socket.on('room:ready', ({ roomId, peer, role }) => {
      files.current.clear();
      stopped.current.clear();
      setItems([]);
      setQr(null);
      setRoom({ id: roomId, peer, role, peerOnline: true });
    });
    socket.on('peer:left', ({ roomId }) => setRoom((r) => (r && r.id === roomId ? { ...r, peerOnline: false } : r)));

    socket.on('file:incoming', ({ id, name: fileName, size, ts, from }) => {
      setItems((l) => [...l, {
        id, dir: 'in', name: fileName, size, ts, status: 'offered', received: 0,
        from: from.name, to: nameRef.current, expiresAt: Date.now() + 600000,
      }]);
    });

    socket.on('transfer:update', (u) => {
      patch(u.id, { status: u.status, received: u.received, expiresAt: Date.now() + u.ttlMs, ...(u.key ? { key: u.key } : {}) });
      if (u.status === 'accepted' && files.current.has(u.id)) {
        queue.current = queue.current.then(() => upload(u.id)).catch(() => {}); // one upload at a time
      }
      if (FINISHED.includes(u.status)) { stopped.current.add(u.id); files.current.delete(u.id); }
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false); setRoom(null); setItems([]); setQr(null);
    };
  }, [name, patch, upload]);

  /* ---------- actions ---------- */
  const createQr = useCallback(async () => {
    const res = await call('qr:create');
    if (!res.ok) return notifyRef.current(res.error);
    setQr({ token: res.token, link: `${window.location.origin}/?join=${res.token}`, expiresAt: Date.now() + res.ttlMs });
  }, [call]);

  const scan = useCallback(async (text) => {
    const token = parseToken(text);
    if (!token) return { ok: false, error: 'That doesn’t look like a Documay QR code.' };
    return call('qr:scan', { token }); // on success the server also sends room:ready
  }, [call]);

  const sendFiles = useCallback(async (list) => {
    for (const file of Array.from(list)) {
      const problem = validateFile(file);
      if (problem) { notifyRef.current(`${file.name}: ${problem}`); continue; }
      const res = await call('file:offer', { name: file.name, size: file.size });
      if (!res.ok) { notifyRef.current(res.error); continue; }
      files.current.set(res.id, file);
      setItems((l) => [...l, {
        id: res.id, dir: 'out', name: file.name, size: file.size, ts: res.ts, status: 'offered', received: 0,
        from: nameRef.current, to: roomRef.current?.peer.name || '', expiresAt: Date.now() + 600000,
      }]);
    }
  }, [call]);

  const respond = useCallback(async (id, accept) => {
    const res = await call(accept ? 'file:accept' : 'file:reject', { id });
    if (!res.ok) notifyRef.current(res.error);
  }, [call]);

  const cancel = useCallback(async (id) => {
    stopped.current.add(id);
    files.current.delete(id);
    await call('file:cancel', { id });
  }, [call]);

  const leave = useCallback(() => {
    call('room:leave');
    files.current.clear();
    setRoom(null); setItems([]);
  }, [call]);

  return { connected, room, items, qr, createQr, scan, sendFiles, respond, cancel, leave };
}
