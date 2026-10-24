import { motion } from 'framer-motion';
import { formatCountdown, formatSize, formatTime, kindOf } from '../utils/files';
import { useCountdown } from '../utils/useTick';
import { CloseIcon, DownloadIcon, FileIcon } from './Icons';

function DropRow({ drop, onDismiss }) {
  const left = useCountdown(drop.expiresAt);
  const downloadUrl = `/api/files/${encodeURIComponent(drop.id)}?key=${encodeURIComponent(drop.key)}`;

  return (
    <div className="inbox-row">
      <div className="inbox-row-left">
        <FileIcon kind={kindOf(drop.name)} size={28} />
        <div className="inbox-row-details">
          <b className="inbox-file-name" title={drop.name}>{drop.name}</b>
          <div className="inbox-meta">
            <span>From <b>{drop.senderName || 'Anonymous'}</b></span>
            <span>·</span>
            <span>{formatSize(drop.size)}</span>
            <span>·</span>
            <span className="inbox-timer">Expires in <b>{formatCountdown(left)}</b></span>
          </div>
        </div>
      </div>

      <div className="inbox-row-actions">
        <a
          href={downloadUrl}
          className="btn btn-sm btn-primary"
          target="_blank"
          rel="noopener noreferrer"
          download={drop.name}
        >
          <DownloadIcon width={14} height={14} /> Download
        </a>
        <button
          type="button"
          className="icon-btn-sm"
          onClick={() => onDismiss(drop.id)}
          title="Dismiss from inbox"
          aria-label="Dismiss"
        >
          <CloseIcon width={12} height={12} />
        </button>
      </div>
    </div>
  );
}

export default function InboxModal({ drops, onDismiss, onClose }) {
  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet inbox-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Drop-box Inbox"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><CloseIcon /></button>

        <div className="inbox-header">
          <h2>📦 24/7 Drop-box Inbox</h2>
          <p className="lede">
            Files dropped to your permanent QR code stay available here for <b>10 minutes</b>.
          </p>
        </div>

        {drops.length === 0 ? (
          <div className="inbox-empty">
            <p>Your Drop-box is currently empty.</p>
            <span className="fine">
              Share or print your permanent QR code — anyone can scan it to drop documents and photos directly into this inbox!
            </span>
          </div>
        ) : (
          <div className="inbox-list">
            {drops.map((drop) => (
              <DropRow key={drop.id} drop={drop} onDismiss={onDismiss} />
            ))}
          </div>
        )}

        <div className="inbox-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </motion.section>
    </motion.div>
  );
}
