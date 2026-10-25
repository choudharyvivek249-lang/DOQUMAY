import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { getHeroForSeed, getRandomHero } from '../utils/heroCards';
import { CloseIcon, DOQUMAY_QR_LOGO_DATA_URI, DoquMayLogo } from './Icons';

export default function PermanentQRModal({ account, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const qrRef = useRef(null);

  const username = account?.username || '';
  const permanentUrl = `${window.location.origin}/?to=${encodeURIComponent(username)}`;

  // Surprise anime / superhero card seeded by username
  const [hero, setHero] = useState(() => getHeroForSeed(username));
  const [cardRevealed, setCardRevealed] = useState(true);

  const handleRerollHero = () => {
    setCardRevealed(false);
    setTimeout(() => {
      setHero((prev) => getRandomHero(prev.id));
      setCardRevealed(true);
    }, 150);
  };

  /**
   * Generates a high-res printable merchant-style anime standee poster
   * and triggers the browser print dialog plus a backup image download
   */
  const handlePrintStandee = async () => {
    const svg = qrRef.current?.querySelector('svg.main-qr-svg');
    if (!svg || downloading) return;
    setDownloading(true);

    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');

      // 1. Soft clean background
      ctx.fillStyle = '#FAF9F6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top Soft Header Gradient
      const grad = ctx.createLinearGradient(0, 0, 1200, 260);
      grad.addColorStop(0, '#EDE9FE');
      grad.addColorStop(0.5, '#F5F3FF');
      grad.addColorStop(1, '#E0F2FE');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 240);

      // Top Tagline Bar
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(150, 24, 900, 48, 24);
      ctx.fill();
      ctx.fillStyle = '#6D28D9';
      ctx.font = 'bold 20px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ WORLD’S 1ST FASTEST & EASIEST DOCUMENT SENDER ⚡', 600, 56);

      // Brand Title
      ctx.fillStyle = '#1E293B';
      ctx.font = '800 62px Manrope, sans-serif';
      ctx.fillText('DoquMay', 600, 140);

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px Manrope, sans-serif';
      ctx.fillText('Instant Document Transfer · For Documents, Not Money', 600, 185);

      // Hero Card Header (Soft Tinted)
      ctx.fillStyle = hero.theme.cardBg || '#F8FAFC';
      ctx.beginPath();
      ctx.roundRect(100, 280, 1000, 160, 28);
      ctx.fill();
      ctx.strokeStyle = hero.theme.cardBorder || '#E2E8F0';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = hero.theme.primary;
      ctx.font = 'bold 22px Manrope, sans-serif';
      ctx.fillText(`${hero.rarity} · ${hero.universe.toUpperCase()}`, 600, 325);

      ctx.fillStyle = '#1E293B';
      ctx.font = '800 36px Manrope, sans-serif';
      ctx.fillText(`${hero.name} – ${hero.cardTitle}`, 600, 375);

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 20px Manrope, sans-serif';
      ctx.fillText(hero.quote, 600, 415);

      // QR Code Container
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(260, 480, 680, 680, 36);
      ctx.fill();
      ctx.strokeStyle = hero.theme.qrBorder || '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Draw QR Code
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 310, 530, 580, 580);

        // Account Handle Pill
        ctx.fillStyle = hero.theme.primary;
        ctx.beginPath();
        ctx.roundRect(220, 1220, 760, 84, 42);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px Manrope, sans-serif';
        ctx.fillText(`Drop Documents to @${username}`, 600, 1274);

        // Instructions
        ctx.fillStyle = '#334155';
        ctx.font = '600 24px Manrope, sans-serif';
        ctx.fillText('Scan with Google Lens, Phone Camera, or DoquMay', 600, 1370);

        ctx.fillStyle = '#64748B';
        ctx.font = '500 18px Manrope, sans-serif';
        ctx.fillText('🔒 Instant Zero-Login Transfer · Files auto-delete in 10 minutes · Powered by DoquMay', 600, 1420);

        const standeeDataUrl = canvas.toDataURL('image/png');

        // 1. Trigger print via invisible iframe
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
          // Fallback if iframe fails
          window.print();
        }

        // 2. Also download image file backup
        const a = document.createElement('a');
        a.download = `DoquMay-Standee-${username}-${hero.name.replace(/\s+/g, '_')}.png`;
        a.href = standeeDataUrl;
        a.click();

        setDownloading(false);
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
        className="sheet hero-qr-sheet permanent-sheet soft-theme"
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

        {/* Global DoquMay Tagline Banner (Soft Shades) */}
        <div className="doqumay-tagline-badge soft">
          <span className="sparkle-icon">⚡</span>
          <span className="tagline-text">WORLD’S 1ST FASTEST &amp; EASIEST DOCUMENT SENDER</span>
          <span className="sparkle-icon">⚡</span>
        </div>

        {/* Pay-App Standee Header (Soft Shades) */}
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

        {/* Anime Art Collectible QR Card (Soft Pastel Backgrounds) */}
        <AnimatePresence mode="wait">
          {cardRevealed && (
            <motion.div
              key={hero.id}
              className="surprise-hero-card permanent-hero-card soft"
              style={{
                background: hero.theme.cardBg,
                borderColor: hero.theme.cardBorder,
                boxShadow: `0 8px 30px ${hero.theme.glow}`,
              }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            >
              {/* Standee Top Card: Character portrait & Details */}
              <div className="hero-card-header soft" style={{ borderBottomColor: hero.theme.cardBorder }}>
                <div className="hero-avatar-wrap">
                  {hero.image ? (
                    <img src={hero.image} alt={hero.name} className="hero-portrait-img" />
                  ) : (
                    <div className="hero-avatar-badge soft" style={{ background: hero.theme.tagBg }}>
                      <span className="hero-emoji">{hero.avatar}</span>
                    </div>
                  )}
                </div>

                <div className="hero-meta">
                  <div className="hero-rarity-row">
                    <span
                      className="hero-rarity-badge soft"
                      style={{ color: hero.theme.primary, borderColor: hero.theme.cardBorder, background: hero.theme.tagBg }}
                    >
                      {hero.rarity}
                    </span>
                    <span className="hero-universe-tag">{hero.universe}</span>
                  </div>
                  <b className="hero-name soft">{hero.name}</b>
                  <span className="hero-card-title soft">{hero.cardTitle}</span>
                </div>

                <button
                  type="button"
                  className="hero-reroll-btn soft"
                  onClick={handleRerollHero}
                  title="Draw another anime character card!"
                >
                  🎲 <span className="reroll-label">Change Anime Art</span>
                </button>
              </div>

              {/* Character Quote */}
              <p className="hero-quote soft" style={{ borderLeftColor: hero.theme.primary, background: '#FFFFFF' }}>
                {hero.quote}
              </p>

              {/* QR Box with Crisp Scannable WHOLE QR Code and Anime Corner Accents */}
              <div
                className="qr-box hero-qr-box permanent soft"
                ref={qrRef}
                style={{ borderColor: hero.theme.qrBorder }}
              >
                {/* Anime Art Corner Finder Eyes */}
                <span className="anime-qr-corner tl" style={{ borderColor: hero.theme.primary }} />
                <span className="anime-qr-corner tr" style={{ borderColor: hero.theme.primary }} />
                <span className="anime-qr-corner bl" style={{ borderColor: hero.theme.primary }} />
                <span className="anime-qr-corner br" style={{ borderColor: hero.theme.primary }} />

                <div className="qr-inner-wrapper">
                  <QRCodeSVG
                    value={permanentUrl}
                    size={220}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    marginSize={2}
                    className="main-qr-svg"
                    imageSettings={{
                      src: DOQUMAY_QR_LOGO_DATA_URI,
                      height: 42,
                      width: 42,
                      excavate: true,
                    }}
                  />
                </div>
              </div>

              {/* Recipient Handle Pill (Soft Style) */}
              <div className="standee-handle-badge soft">
                <span className="pulse-indicator" />
                <span>Drop Documents to <b>@{username}</b> (Never Expires)</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ONE SINGLE CLEAN PRINT BUTTON AT BOTTOM */}
        <motion.button
          className="btn btn-primary soft btn-print-standee"
          onClick={handlePrintStandee}
          disabled={downloading}
          whileTap={{ scale: 0.98 }}
        >
          🖨️ {downloading ? 'Preparing Standee Print…' : 'Print QR Standee'}
        </motion.button>
      </motion.section>
    </motion.div>
  );
}
