import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT } from '../utils/files';
import { useNow } from '../utils/useTick';
import Avatar from './Avatar';
import FileCard from './FileCard';
import { BackIcon, ClipIcon } from './Icons';
import SendPinModal from './SendPinModal';
import WhatsAppHandoffModal from './WhatsAppHandoffModal';

export default function TransferRoom({
  room,
  items,
  account,
  onBack,
  onSend,
  onCancel,
  onVerifySendPin,
  onOpenWhatsApp,
  onOpenAuth,
}) {
  const now = useNow(1000);
  const fileInput = useRef(null);
  const endRef = useRef(null);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [completedSendFiles, setCompletedSendFiles] = useState([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length]);

  const handlePickFiles = (e) => {
    if (!e.target.files?.length) return;
    const list = Array.from(e.target.files);
    e.target.value = '';

    if (account) {
      setPendingFiles(list);
      setShowPinModal(true);
      return;
    }

    // Guest in transfer room: send directly with receiver consent
    onSend(list, null);
    setCompletedSendFiles(list);
  };

  const handleVerifyPin = async (pinString) => {
    const res = await onVerifySendPin(
      pinString,
      room.peer?.name || 'peer',
      pendingFiles.length,
      `room-${room.id}-${Date.now()}`
    );
    if (!res.ok) {
      return res;
    }

    setShowPinModal(false);
    onSend(pendingFiles, res.sendAuthToken);
    setCompletedSendFiles(pendingFiles);
    setPendingFiles([]);
    return { ok: true };
  };

  const hasSentFiles = items.some((i) => i.dir === 'out' && (i.status === 'ready' || i.status === 'done'));

  return (
    <motion.main
      className="screen room"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
    >
      <header className="room-head">
        <button className="icon-btn" onClick={onBack} aria-label="Leave room">
          <BackIcon />
        </button>
        <Avatar name={room.peer?.name || 'Partner'} size={42} />
        <div className="who">
          <b>Chat &amp; Share with {room.peer?.name}</b>
          <span className={`badge ${room.peerOnline ? 'on' : 'off'}`}>
            {room.peerOnline ? '🔒 PIN Protected Transfer' : 'Disconnected'}
          </span>
        </div>
        {onOpenWhatsApp && (
          <button
            type="button"
            className="btn btn-permanent-outline"
            onClick={onOpenWhatsApp}
            style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            💬 WhatsApp Hub
          </button>
        )}
      </header>

      <div className="list" aria-live="polite">
        <div className="wa-encryption-notice">
          🛡️ 4-Digit Send PIN Protected · End-to-end streamed directly between your devices.
        </div>

        {hasSentFiles && (
          <div
            className="wa-date-pill"
            style={{ cursor: 'pointer', background: '#dcf8c6', color: '#075e54', fontWeight: 600, padding: '8px 16px' }}
            onClick={() => setShowHandoffModal(true)}
          >
            ✓ File sent! Tap to share via WhatsApp 💬
          </div>
        )}

        {items.length === 0 && (
          <div className="empty-room">
            <p>
              <b>Connected with {room.peer?.name}!</b>
            </p>
            <p>
              Both devices can send photos, PDFs, and documents. Every send requires your 4-digit Send PIN. Tap the button below to send a file!
            </p>
          </div>
        )}
        {items.map((it) => (
          <FileCard key={it.id} item={it} now={now} onCancel={onCancel} />
        ))}
        <div ref={endRef} />
      </div>

      <footer className="composer">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={handlePickFiles} />
        <motion.button
          className="btn btn-primary attach"
          onClick={() => fileInput.current.click()}
          disabled={!room.peerOnline}
          whileTap={{ scale: 0.97 }}
        >
          <ClipIcon width={22} height={22} />
          {room.peerOnline ? `Send a file to ${room.peer?.name}` : 'Scan again to reconnect'}
        </motion.button>
        <p className="fine">Photos, PDF, Word, Excel, PowerPoint · Secured by 4-digit PIN</p>
      </footer>

      {/* 4-Digit Send PIN Verification Screen */}
      <AnimatePresence>
        {showPinModal && (
          <SendPinModal
            recipient={room.peer?.name || 'Partner'}
            filesCount={pendingFiles.length}
            totalSize={pendingFiles.reduce((acc, f) => acc + (f.size || 0), 0)}
            onVerify={handleVerifyPin}
            onForgotPin={() => {
              setShowPinModal(false);
              onOpenAuth?.();
            }}
            onClose={() => {
              setShowPinModal(false);
              setPendingFiles([]);
            }}
          />
        )}
      </AnimatePresence>

      {/* WhatsApp Sharing Handoff Modal */}
      <AnimatePresence>
        {showHandoffModal && (
          <WhatsAppHandoffModal
            recipient={room.peer?.name || 'Partner'}
            files={completedSendFiles}
            fileResults={items.filter((i) => i.dir === 'out')}
            onClose={() => setShowHandoffModal(false)}
            onOpenHub={onOpenWhatsApp}
          />
        )}
      </AnimatePresence>
    </motion.main>
  );
}
