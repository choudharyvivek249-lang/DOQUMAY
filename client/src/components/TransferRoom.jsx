import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ACCEPT } from '../utils/files';
import { useNow } from '../utils/useTick';
import Avatar from './Avatar';
import { BackIcon, ClipIcon } from './Icons';
import FileCard from './FileCard';

export default function TransferRoom({ room, items, onBack, onSend, onCancel }) {
  const now = useNow(1000);
  const fileInput = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items.length]);

  const pick = (e) => { if (e.target.files?.length) onSend(e.target.files); e.target.value = ''; };

  return (
    <motion.main className="screen room" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}>
      <header className="room-head">
        <button className="icon-btn" onClick={onBack} aria-label="Leave room"><BackIcon /></button>
        <Avatar name={room.peer.name} size={42} />
        <div className="who">
          <b>Send files to: {room.peer.name}</b>
          <span className={`badge ${room.peerOnline ? 'on' : 'off'}`}>{room.peerOnline ? 'Connected via QR' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="list" aria-live="polite">
        {items.length === 0 && (
          <div className="empty-room">
            <p><b>You’re connected.</b></p>
            <p>Tap the paperclip to send a photo or document. {room.peer.name} will be asked to accept it first.</p>
          </div>
        )}
        {items.map((it) => <FileCard key={it.id} item={it} now={now} onCancel={onCancel} />)}
        <div ref={endRef} />
      </div>

      <footer className="composer">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
        <motion.button className="btn btn-primary attach" onClick={() => fileInput.current.click()} disabled={!room.peerOnline} whileTap={{ scale: 0.97 }}>
          <ClipIcon width={22} height={22} /> {room.peerOnline ? 'Attach a file' : 'Scan again to reconnect'}
        </motion.button>
        <p className="fine">Photos, PDF, Word, Excel, PowerPoint · up to 100 MB</p>
      </footer>
    </motion.main>
  );
}
