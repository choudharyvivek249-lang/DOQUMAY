import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ACCEPT } from '../utils/files';
import { useNow } from '../utils/useTick';
import Avatar from './Avatar';
import FileCard from './FileCard';
import { BackIcon, ClipIcon } from './Icons';
import SecurityPinHandshake from './SecurityPinHandshake';

export default function TransferRoom({
  room,
  items,
  onBack,
  onSend,
  onCancel,
  onVerifyPin,
  onAuthorizeHost,
}) {
  const now = useNow(1000);
  const fileInput = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length]);

  const pick = (e) => {
    if (e.target.files?.length) onSend(e.target.files);
    e.target.value = '';
  };

  return (
    <motion.main
      className="screen room"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
    >
      {/* 4-Digit Security PIN Handshake Overlay before first file share */}
      <AnimatePresence>
        {!room.verified && (
          <SecurityPinHandshake
            room={room}
            onVerifyPin={onVerifyPin}
            onAuthorizeHost={onAuthorizeHost}
            onCancel={onBack}
          />
        )}
      </AnimatePresence>

      <header className="room-head">
        <button className="icon-btn" onClick={onBack} aria-label="Leave room">
          <BackIcon />
        </button>
        <Avatar name={room.peer.name} size={42} />
        <div className="who">
          <b>Chat &amp; Share with {room.peer.name}</b>
          <span className={`badge ${room.peerOnline ? 'on' : 'off'}`}>
            {room.peerOnline ? '🔒 PIN Verified · Both can send files' : 'Disconnected'}
          </span>
        </div>
      </header>

      <div className="list" aria-live="polite">
        <div className="wa-encryption-notice">
          🛡️ 4-Digit Security Handshake Verified · End-to-end streamed directly between your devices.
        </div>

        {items.length === 0 && (
          <div className="empty-room">
            <p>
              <b>Connected with {room.peer.name}!</b>
            </p>
            <p>
              Both devices can send photos, PDFs, and documents to each other. Tap the paperclip below to send a file!
            </p>
          </div>
        )}
        {items.map((it) => (
          <FileCard key={it.id} item={it} now={now} onCancel={onCancel} />
        ))}
        <div ref={endRef} />
      </div>

      <footer className="composer">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
        <motion.button
          className="btn btn-primary attach"
          onClick={() => fileInput.current.click()}
          disabled={!room.peerOnline || !room.verified}
          whileTap={{ scale: 0.97 }}
        >
          <ClipIcon width={22} height={22} />
          {!room.verified
            ? 'Waiting for PIN Verification…'
            : room.peerOnline
            ? `Send a file to ${room.peer.name}`
            : 'Scan again to reconnect'}
        </motion.button>
        <p className="fine">Photos, PDF, Word, Excel, PowerPoint · up to 100 MB</p>
      </footer>
    </motion.main>
  );
}
