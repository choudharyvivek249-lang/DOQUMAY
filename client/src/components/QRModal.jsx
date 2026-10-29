import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { formatCountdown } from '../utils/files';
import { useCountdown } from '../utils/useTick';
import { CloseIcon, CopyIcon, DOQUMAY_QR_LOGO_DATA_URI, DoquMayLogo, RefreshIcon } from './Icons';

const QR_LIFETIME = 120000;

export default function QRModal({ qr, name, onRefresh, onClose }) {
  const left = useCountdown(qr?.expiresAt);
  const expired = Boolean(qr) && left <= 0;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    onRefresh();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qr.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard needs https */
    }
  };

  return (
    <motion.div
      className="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="sheet simple-qr-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="DoquMay QR Code"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {/* Brand Header */}
        <div className="standee-header soft">
          <DoquMayLogo size={42} showTagline={false} />
          <div className="standee-title-wrap">
            <h2 className="brand-h2">
              <span className="brand-doqu">Doqu</span>
              <span className="brand-may">May</span>
              <span className="standee-verified-badge" title="Verified Instant Transfer">✓ 1-to-1 Transfer</span>
            </h2>
            <span className="standee-not-money-caption">
              📄 For Documents &amp; Files · <b>Not for Money</b>
            </span>
          </div>
        </div>

        {/* Subtitle */}
        <div className="simple-qr-info">
          <h3>{name}’s 1-to-1 QR Code</h3>
          <p className="simple-qr-lede">
            Ask the recipient or sender to scan this code with any phone camera or DoquMay to connect directly.
          </p>
        </div>

        {/* Crisp Clean QR Box */}
        <div className={`qr-box simple-qr-box ${expired ? 'dead' : ''}`}>
          {qr ? (
            <QRCodeSVG
              value={qr.link}
              size={230}
              level="H"
              bgColor="#ffffff"
              fgColor="#0f172a"
              marginSize={2}
              className="main-qr-svg"
              imageSettings={{
                src: DOQUMAY_QR_LOGO_DATA_URI,
                height: 44,
                width: 44,
                excavate: true,
              }}
            />
          ) : (
            <div className="qr-skeleton" />
          )}

          {expired && qr && (
            <div className="qr-expired">
              <b>QR Expired</b>
              <span>Temporary codes last 2 minutes for privacy. Click below to refresh.</span>
            </div>
          )}
        </div>

        {/* Timer & Controls */}
        {expired ? (
          <motion.button className="btn btn-primary" onClick={onRefresh} whileTap={{ scale: 0.97 }} style={{ marginTop: '0.75rem' }}>
            <RefreshIcon width={20} height={20} /> Refresh QR Code
          </motion.button>
        ) : qr ? (
          <>
            <p className="timer" role="timer" aria-live="off" style={{ marginTop: '0.5rem' }}>
              Expires in <b>{formatCountdown(left)}</b>
            </p>
            <div className="timer-bar">
              <i style={{ width: `${Math.min(100, (left / QR_LIFETIME) * 100)}%` }} />
            </div>
            <button className="link" onClick={copy} style={{ marginTop: '0.5rem' }}>
              <CopyIcon width={16} height={16} /> {copied ? 'Link Copied!' : 'Copy Direct Link'}
            </button>
          </>
        ) : (
          <p className="timer">Creating your code…</p>
        )}

        <p className="fine text-center" style={{ marginTop: '0.5rem' }}>
          🔒 Direct secure transfer · Auto-deletes in 10 minutes
        </p>
      </motion.section>
    </motion.div>
  );
}
