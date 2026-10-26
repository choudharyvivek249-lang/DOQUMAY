import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { CloseIcon, CopyIcon, DOQUMAY_QR_LOGO_DATA_URI, DoquMayLogo, QrIcon, ShareIcon } from './Icons';

export default function PermanentQRModal({ account, onClose }) {
  const [downloading, setDownloading] = useState(false);
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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Drop files to @${username} on DoquMay`,
          text: `Scan my DoquMay QR code or open this link to send me documents & photos instantly:`,
          url: permanentUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copy();
    }
  };

  /**
   * Generates a clean, high-resolution merchant-ready document standee poster
   * and triggers the browser print dialog plus a backup image download
   */
  const handlePrintStandee = async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');

      // 1. Clean crisp background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top Soft Header Gradient
      const grad = ctx.createLinearGradient(0, 0, 1200, 240);
      grad.addColorStop(0, '#F5F3FF');
      grad.addColorStop(0.5, '#FAF5FF');
      grad.addColorStop(1, '#F0F9FF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 240);

      // Top Tagline Pill
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(150, 24, 900, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#7C3AED';
      ctx.font = 'bold 18px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ WORLD’S 1ST FASTEST & EASIEST DOCUMENT SENDER ⚡', 600, 52);

      // Brand Title
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 58px Manrope, sans-serif';
      ctx.fillText('DoquMay', 600, 135);

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px Manrope, sans-serif';
      ctx.fillText('Instant Document Transfer · For Documents, Not Money', 600, 180);

      // Handle Card
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.roundRect(140, 270, 920, 110, 24);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.font = '800 36px Manrope, sans-serif';
      ctx.fillText(`Drop Documents to @${username}`, 600, 325);

      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 20px Manrope, sans-serif';
      ctx.fillText('✓ Permanent Standee · Never Expires', 600, 360);

      // QR Code Container Background
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(240, 420, 720, 720, 36);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw QR code from SVG
      const artSvg = qrRef.current?.querySelector('svg.main-qr-svg');

      const finishPrint = (qrImg) => {
        if (qrImg) {
          ctx.drawImage(qrImg, 270, 450, 660, 660);
        }

        // Instructions Section
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 26px Manrope, sans-serif';
        ctx.fillText('Scan with Phone Camera, Google Lens, or DoquMay', 600, 1220);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 20px Manrope, sans-serif';
        ctx.fillText('1. Scan QR  ·  2. Pick Files  ·  3. Enter 4-digit PIN & Send', 600, 1265);

        // Security footer
        ctx.fillStyle = '#F1F5F9';
        ctx.beginPath();
        ctx.roundRect(140, 1320, 920, 80, 20);
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.font = '600 18px Manrope, sans-serif';
        ctx.fillText('🔒 Instant Zero-Login Transfer · Files auto-delete in 10 minutes · Powered by DoquMay', 600, 1368);

        const standeeDataUrl = canvas.toDataURL('image/png');

        // Trigger print via invisible iframe
        try {
          let iframe = document.getElementById('doqumay-print-frame');
          if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'doqumay-print-frame';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);
          }

          const frameDoc = iframe.contentWindow.document;
          frameDoc.open();
          frameDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>DoquMay Standee - @${username}</title>
                <style>
                  @page { size: auto; margin: 10mm; }
                  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
                  img { max-width: 100%; max-height: 96vh; object-fit: contain; }
                </style>
              </head>
              <body>
                <img src="${standeeDataUrl}" onload="window.focus(); window.print();" />
              </body>
            </html>
          `);
          frameDoc.close();
        } catch {
          window.print();
        }

        // Backup download
        const a = document.createElement('a');
        a.download = `DoquMay-Standee-${username}.png`;
        a.href = standeeDataUrl;
        a.click();

        setDownloading(false);
      };

      if (artSvg) {
        const svgData = new XMLSerializer().serializeToString(artSvg);
        const img = new Image();
        img.onload = () => finishPrint(img);
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      } else {
        finishPrint(null);
      }
    } catch (e) {
      console.error(e);
      window.print();
      setDownloading(false);
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
        className="sheet permanent-sheet simple-qr-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="DoquMay Permanent QR Standee"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {/* Brand Standee Header */}
        <div className="standee-header soft">
          <DoquMayLogo size={42} showTagline={false} />
          <div className="standee-title-wrap">
            <h2 className="brand-h2">
              <span className="brand-doqu">Doqu</span>
              <span className="brand-may">May</span>
              <span className="standee-permanent-pill soft">Permanent Standee</span>
            </h2>
            <span className="standee-not-money-caption">
              📄 For Documents &amp; Files · <b>Not for Money</b>
            </span>
          </div>
        </div>

        {/* Clean Subtitle & Handle */}
        <div className="simple-qr-info">
          <h3>Drop Documents to <b>@{username}</b></h3>
          <p className="simple-qr-lede">
            This QR code <b>never expires</b>. Anyone can scan it with any phone camera or Google Lens to send you documents directly.
          </p>
        </div>

        {/* Clean, High-Contrast Scannable QR Code */}
        <div className="qr-box permanent simple-qr-box" ref={qrRef}>
          <div className="qr-inner-wrapper">
            <QRCodeSVG
              value={permanentUrl}
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
          </div>
        </div>

        {/* Recipient Handle Pill */}
        <div className="perm-url-pill" onClick={copy} title="Click to copy link">
          <code>{window.location.host}/?to=@{username}</code>
          <button type="button" className="icon-btn-sm" aria-label="Copy link">
            <CopyIcon width={16} height={16} />
          </button>
        </div>

        {/* Clean Action Buttons */}
        <div className="btn-group" style={{ marginTop: '0.85rem' }}>
          <motion.button
            className="btn btn-primary btn-print-standee"
            onClick={handlePrintStandee}
            disabled={downloading}
            whileTap={{ scale: 0.98 }}
          >
            🖨️ {downloading ? 'Preparing Standee Print…' : 'Print QR Standee'}
          </motion.button>

          <motion.button
            className="btn btn-pill"
            onClick={copy}
            whileTap={{ scale: 0.98 }}
          >
            <CopyIcon width={18} height={18} /> {copied ? 'Link Copied!' : 'Copy Link'}
          </motion.button>
        </div>

        {navigator.share && (
          <button className="link" onClick={handleShare} style={{ marginTop: '0.65rem' }}>
            <ShareIcon width={16} height={16} /> Share Link with Sender
          </button>
        )}

        <p className="fine text-center" style={{ marginTop: '0.6rem' }}>
          🔒 Protected by 4-digit Send PIN verification · Auto-deletes in 10 minutes
        </p>
      </motion.section>
    </motion.div>
  );
}
