import { motion } from 'framer-motion';
import { useState } from 'react';
import { formatSize, kindOf } from '../utils/files';
import { CheckDoubleIcon, CloseIcon, CopyIcon, FileIcon } from './Icons';

/**
 * WhatsApp Sharing Handoff Modal.
 * Makes WhatsApp the primary sharing destination for completed file transfers.
 * Provides native file sharing if available, or official WhatsApp click-to-chat with protected temporary download link.
 * Requires fresh user gesture to launch sharing cleanly.
 */
export default function WhatsAppHandoffModal({
  recipient,
  files = [],
  fileResults = [], // array of { id, name, size, key, downloadUrl }
  onClose,
  onOpenHub,
}) {
  const [copied, setCopied] = useState(false);
  const [shareAttempted, setShareAttempted] = useState(false);

  const primaryFile = files[0] || fileResults[0] || {};
  const primaryResult = fileResults[0] || {};

  // Construct secure temporary download link
  const origin = window.location.origin;
  const cleanRecipient = recipient.replace(/^@/, '');
  const downloadUrl = primaryResult.key && primaryResult.id

    ? `${origin}/api/files/${encodeURIComponent(primaryResult.id)}?key=${encodeURIComponent(primaryResult.key)}`
    : `${origin}/receive/${encodeURIComponent(cleanRecipient)}`;

  const filesCount = files.length || fileResults.length || 1;
  const fileNames = files.map((f) => f.name).join(', ') || primaryResult.name || 'document';

  const shareText = `📄 Sent via DoquMay: ${fileNames} (${filesCount} file${filesCount > 1 ? 's' : ''})
🔒 Temporary secure download for @${cleanRecipient} (expires in 10 minutes):
${downloadUrl}

⚡ Ephemeral & Secure Document Transfer`;

  const handleContinueToWhatsApp = async () => {
    setShareAttempted(true);

    // 1. Try native Web Share API with files if supported by browser
    if (navigator.canShare && files.length > 0) {
      try {
        if (navigator.canShare({ files })) {
          await navigator.share({
            files,
            title: `DoquMay Document Transfer to @${cleanRecipient}`,
            text: `Sent via DoquMay to @${cleanRecipient}. Protected download: ${downloadUrl}`,
          });
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // User simply cancelled share dialog
        console.warn('Native file share failed or not allowed, falling back to WhatsApp link:', err);
      }
    }

    // 2. Fallback to official WhatsApp Click-to-Chat URL
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <motion.div
      className="backdrop center-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="wa-handoff-card"
        role="dialog"
        aria-modal="true"
        aria-label="WhatsApp Sharing Handoff"
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn close wa-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon width={18} height={18} />
        </button>

        {/* WhatsApp Brand Header */}
        <div className="wa-handoff-header">
          <div className="wa-brand-icon-wrap">
            <span className="wa-brand-emoji">💬</span>
          </div>
          <h2>Ready to Share via WhatsApp</h2>
          <p className="wa-handoff-sub">
            Direct secure transfer. Send the protected download link to{' '}
            <b>@{cleanRecipient}</b>.
          </p>
        </div>

        {/* Files Overview Card */}
        <div className="wa-handoff-files-card">
          <div className="wa-handoff-file-row">
            <FileIcon kind={kindOf(primaryFile.name || primaryResult.name || 'doc')} size={30} />
            <div className="wa-handoff-file-details">
              <span className="wa-handoff-filename">
                {filesCount === 1
                  ? (primaryFile.name || primaryResult.name || 'Document')
                  : `${filesCount} Files (${fileNames})`}
              </span>
              <span className="wa-handoff-meta">
                {formatSize(files.reduce((acc, f) => acc + (f.size || 0), 0) || primaryResult.size || 0)} · ⏳ Auto-deletes in 10 minutes
              </span>
            </div>
            <span className="wa-status-tag-verified">🔒 Ready to Share</span>
          </div>
        </div>

        {/* Transparent Security Notice */}
        <div className="wa-disclaimer-box">
          <span className="wa-disclaimer-icon">ℹ️</span>
          <p>
            Tapping <b>Continue to WhatsApp</b> will launch WhatsApp with your protected temporary DoquMay link.
            Files are kept secure for 10 minutes.
          </p>
        </div>

        {/* Primary Action: Continue to WhatsApp (User gesture) */}
        <motion.button
          type="button"
          className="btn wa-handoff-primary-btn"
          onClick={handleContinueToWhatsApp}
          whileTap={{ scale: 0.97 }}
        >
          <span className="wa-btn-icon">💬</span>
          <span>Continue to WhatsApp</span>
        </motion.button>

        {/* Secondary Actions: Copy Link & Open Hub */}
        <div className="wa-handoff-secondary-row">
          <button
            type="button"
            className="btn btn-pill wa-copy-btn"
            onClick={handleCopyLink}
          >
            <CopyIcon width={16} height={16} />
            <span>{copied ? 'Copied WhatsApp Link!' : 'Copy WhatsApp Link'}</span>
          </button>

          {onOpenHub && (
            <button
              type="button"
              className="btn btn-pill wa-hub-btn"
              onClick={onOpenHub}
            >
              <span>View in Hub</span>
            </button>
          )}
        </div>

        {shareAttempted && (
          <p className="wa-handoff-note">
            💡 If WhatsApp didn't open automatically, use the <b>Copy WhatsApp Link</b> button above to paste it into your chat.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
