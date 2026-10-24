import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { CloseIcon, CopyIcon, QrIcon } from './Icons';

export default function PermanentQRModal({ account, onClose }) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);

  const username = account?.username || '';
  const permanentUrl = `${window.location.origin}/?to=${encodeURIComponent(username)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(permanentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 100, 100, 800, 800);
      const a = document.createElement('a');
      a.download = `documay-qr-${username}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${username} on Documay`,
          text: `Scan my permanent Documay QR code or send me files directly:`,
          url: permanentUrl,
        });
      } catch { /* cancelled */ }
    } else {
      copy();
    }
  };

  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Permanent QR Scanner"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><CloseIcon /></button>

        <div className="perm-badge">
          <span>✨ Permanent Scanner</span>
        </div>

        <h2>@{username}’s Permanent QR</h2>
        <p className="lede">
          This QR code <b>never expires</b>. Anyone can scan it anytime to drop documents or photos directly to your account!
        </p>

        <div className="qr-box permanent" ref={qrRef}>
          <QRCodeSVG
            value={permanentUrl}
            size={220}
            level="H"
            bgColor="#ffffff"
            fgColor="#2d3a2b"
            marginSize={2}
          />
        </div>

        <div className="perm-url-pill" onClick={copy} title="Click to copy link">
          <code>{window.location.host}/?to=@{username}</code>
          <button type="button" className="icon-btn-sm" aria-label="Copy link">
            <CopyIcon width={16} height={16} />
          </button>
        </div>

        <div className="btn-group">
          <motion.button className="btn btn-primary" onClick={copy} whileTap={{ scale: 0.97 }}>
            <CopyIcon width={18} height={18} /> {copied ? 'Link Copied!' : 'Copy Permanent Link'}
          </motion.button>
          <motion.button className="btn btn-pill" onClick={downloadQr} whileTap={{ scale: 0.97 }}>
            <QrIcon width={18} height={18} /> Download Printable QR
          </motion.button>
        </div>

        {navigator.share && (
          <button className="link" onClick={handleShare} style={{ marginTop: '0.5rem' }}>
            Share Link with Friends
          </button>
        )}

        <p className="fine text-center" style={{ marginTop: '0.75rem' }}>
          Tip: You can print this QR code or save it to your desk or shop counter. Senders don't even need an account to send you files!
        </p>
      </motion.section>
    </motion.div>
  );
}
