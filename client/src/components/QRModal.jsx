import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { formatCountdown } from '../utils/files';
import { useCountdown } from '../utils/useTick';
import { CloseIcon, CopyIcon, RefreshIcon } from './Icons';

const QR_LIFETIME = 120000;

export default function QRModal({ qr, name, onRefresh, onClose }) {
  const left = useCountdown(qr?.expiresAt);
  const expired = Boolean(qr) && left <= 0;
  const [copied, setCopied] = useState(false);

  useEffect(() => { onRefresh(); }, []); // a fresh code every time the sheet opens

  const copy = async () => {
    try { await navigator.clipboard.writeText(qr.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard needs https */ }
  };

  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="sheet" role="dialog" aria-modal="true" aria-label="My QR code"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <h2>{name}’s QR code</h2>
        <p className="lede">Ask the other person to scan this with Documay.</p>

        <div className={`qr-box ${expired ? 'dead' : ''}`}>
          {qr ? <QRCodeSVG value={qr.link} size={216} level="M" bgColor="#ffffff" fgColor="#2d3a2b" marginSize={1} /> : <div className="qr-skeleton" />}
          {expired && qr && (
            <div className="qr-expired"><b>QR expired</b><span>Codes last 2 minutes so no one can reuse them.</span></div>
          )}
        </div>

        {expired ? (
          <motion.button className="btn btn-primary" onClick={onRefresh} whileTap={{ scale: 0.97 }}>
            <RefreshIcon width={20} height={20} /> Refresh QR
          </motion.button>
        ) : qr ? (
          <>
            <p className="timer" role="timer" aria-live="off">Expires in <b>{formatCountdown(left)}</b></p>
            <div className="timer-bar"><i style={{ width: `${Math.min(100, (left / QR_LIFETIME) * 100)}%` }} /></div>
            <button className="link" onClick={copy}><CopyIcon width={16} height={16} /> {copied ? 'Link copied' : 'Copy link instead'}</button>
          </>
        ) : <p className="timer">Creating your code…</p>}
      </motion.section>
    </motion.div>
  );
}
