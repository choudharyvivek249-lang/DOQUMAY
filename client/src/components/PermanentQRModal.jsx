import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { getHeroForSeed, getRandomHero } from '../utils/heroCards';
import { CloseIcon, CopyIcon, DOQUMAY_QR_LOGO_DATA_URI, DoquMayLogo, QrIcon } from './Icons';

export default function PermanentQRModal({ account, onClose }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const qrRef = useRef(null);

  const username = account?.username || '';
  const permanentUrl = `${window.location.origin}/?to=${encodeURIComponent(username)}`;

  // Surprise superhero / anime card seeded by username
  const [hero, setHero] = useState(() => getHeroForSeed(username));
  const [cardRevealed, setCardRevealed] = useState(true);

  const handleRerollHero = () => {
    setCardRevealed(false);
    setTimeout(() => {
      setHero((prev) => getRandomHero(prev.id));
      setCardRevealed(true);
    }, 150);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(permanentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback */
    }
  };

  /**
   * Generates a high-res printable merchant-style standee poster
   * with the hero card, DoquMay branding, and the QR code
   */
  const downloadPrintableStandee = async () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg || downloading) return;
    setDownloading(true);

    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');

      // 1. Standee Background
      ctx.fillStyle = '#0f0c1b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Top Header Gradient
      const grad = ctx.createLinearGradient(0, 0, 1200, 320);
      grad.addColorStop(0, '#4A0E78');
      grad.addColorStop(0.5, '#5F259F');
      grad.addColorStop(1, '#00D2FF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 300);

      // Top Tagline Bar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, 1200, 52);
      ctx.fillStyle = '#00F5A0';
      ctx.font = 'bold 22px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ WORLD’S 1ST FASTEST & EASIEST DOCUMENT SENDER ⚡', 600, 36);

      // Brand Title
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 68px Manrope, sans-serif';
      ctx.fillText('DoquMay', 600, 150);

      ctx.fillStyle = '#E0AAFF';
      ctx.font = '600 24px Manrope, sans-serif';
      ctx.fillText('Instant Document & Photo Hub · For Documents, Not Money!', 600, 195);

      // Hero Card Header
      ctx.fillStyle = hero.theme.primary;
      ctx.beginPath();
      ctx.roundRect(100, 340, 1000, 160, 24);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Manrope, sans-serif';
      ctx.fillText(`${hero.rarity} · ${hero.universe.toUpperCase()}`, 600, 385);

      ctx.font = '800 38px Manrope, sans-serif';
      ctx.fillText(`${hero.avatar} ${hero.name}: ${hero.cardTitle}`, 600, 435);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'italic 22px Manrope, sans-serif';
      ctx.fillText(hero.quote, 600, 475);

      // QR Code Background Card
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(220, 540, 760, 760, 36);
      ctx.fill();

      // Draw QR Code
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 280, 600, 640, 640);

        // Account Handle Banner
        ctx.fillStyle = '#5F259F';
        ctx.beginPath();
        ctx.roundRect(200, 1340, 800, 90, 45);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Manrope, sans-serif';
        ctx.fillText(`Drop Documents to @${username}`, 600, 1398);

        // Footer instructions
        ctx.fillStyle = '#90E0EF';
        ctx.font = '500 24px Manrope, sans-serif';
        ctx.fillText('Scan with Google Lens, Phone Camera, or DoquMay · Zero Login Needed', 600, 1485);

        ctx.fillStyle = '#8E9AAF';
        ctx.font = '500 18px Manrope, sans-serif';
        ctx.fillText('🔒 End-to-end encrypted · Auto-deletes in 10 minutes · Powered by DoquMay', 600, 1535);

        const a = document.createElement('a');
        a.download = `DoquMay-Standee-${username}-${hero.name.replace(/\s+/g, '_')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        setDownloading(false);
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
      console.error(e);
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `@${username} on DoquMay`,
          text: `Scan my permanent DoquMay QR code or drop files directly to me:`,
          url: permanentUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copy();
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
        className="sheet hero-qr-sheet permanent-sheet"
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

        {/* Global DoquMay Tagline Banner */}
        <div className="doqumay-tagline-badge">
          <span className="sparkle-icon">⚡</span>
          <span className="tagline-text">WORLD’S 1ST FASTEST &amp; EASIEST DOCUMENT SENDER</span>
          <span className="sparkle-icon">⚡</span>
        </div>

        {/* Pay-App Standee Header */}
        <div className="standee-header">
          <DoquMayLogo size={46} showTagline={false} />
          <div className="standee-title-wrap">
            <h2 className="brand-h2">
              <span className="brand-doqu">Doqu</span>
              <span className="brand-may">May</span>
              <span className="standee-permanent-pill">Permanent Standee</span>
            </h2>
            <span className="standee-not-money-caption">
              📄 For Documents &amp; Files · <b>Not for Money</b>
            </span>
          </div>
        </div>

        {/* Surprise Superhero / Anime Collectible Card */}
        <AnimatePresence mode="wait">
          {cardRevealed && (
            <motion.div
              key={hero.id}
              className="surprise-hero-card permanent-hero-card"
              style={{
                background: hero.theme.cardBg,
                borderColor: hero.theme.primary,
                boxShadow: `0 8px 32px ${hero.theme.glow}`,
              }}
              initial={{ scale: 0.94, opacity: 0, rotateY: 10 }}
              animate={{ scale: 1, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.94, opacity: 0, rotateY: -10 }}
              transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            >
              {/* Standee Top Card */}
              <div className="hero-card-header" style={{ borderBottomColor: `${hero.theme.primary}44` }}>
                <div className="hero-avatar-badge" style={{ background: hero.theme.gradient }}>
                  <span className="hero-emoji">{hero.avatar}</span>
                </div>
                <div className="hero-meta">
                  <div className="hero-rarity-row">
                    <span className="hero-rarity-badge" style={{ color: hero.rarityColor, borderColor: hero.rarityColor }}>
                      {hero.rarity}
                    </span>
                    <span className="hero-universe-tag">{hero.universe}</span>
                  </div>
                  <b className="hero-name">{hero.name}</b>
                  <span className="hero-card-title">{hero.cardTitle}</span>
                </div>
                <button
                  type="button"
                  className="hero-reroll-btn"
                  onClick={handleRerollHero}
                  title="Draw another surprise character card!"
                >
                  🎲 <span className="reroll-label">Change Hero</span>
                </button>
              </div>

              {/* Character Quote */}
              <p className="hero-quote" style={{ borderLeftColor: hero.theme.primary }}>
                {hero.quote}
              </p>

              {/* QR Box with Embedded DoquMay Logo */}
              <div
                className="qr-box hero-qr-box permanent"
                ref={qrRef}
                style={{ borderColor: hero.theme.primary }}
              >
                <div className="qr-inner-wrapper">
                  <QRCodeSVG
                    value={permanentUrl}
                    size={220}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#111111"
                    marginSize={2}
                    imageSettings={{
                      src: DOQUMAY_QR_LOGO_DATA_URI,
                      height: 46,
                      width: 46,
                      excavate: true,
                    }}
                  />
                  {/* Glowing center logo badge */}
                  <div className="qr-center-logo-overlay">
                    <DoquMayLogo size={36} />
                  </div>
                </div>
              </div>

              {/* Recipient Handle Pill */}
              <div className="standee-handle-badge">
                <span className="pulse-indicator" />
                <span>Drop Files to <b>@{username}</b> (Never Expires)</span>
              </div>

              {/* Hero Stats */}
              <div className="hero-stats-row">
                <div className="hero-stat">
                  <span className="stat-label">⚡ Transfer Speed</span>
                  <b className="stat-value" style={{ color: hero.theme.tagColor }}>{hero.statSpeed}</b>
                </div>
                <div className="hero-stat">
                  <span className="stat-label">🛡️ Security</span>
                  <b className="stat-value">End-to-End</b>
                </div>
                <div className="hero-stat">
                  <span className="stat-label">🎯 Status</span>
                  <b className="stat-value" style={{ color: '#00F5A0' }}>24/7 Active</b>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Personalized URL Pill */}
        <div className="perm-url-pill" onClick={copy} title="Click to copy link">
          <code>{window.location.host}/?to={username}</code>
          <button type="button" className="icon-btn-sm" aria-label="Copy link">
            <CopyIcon width={16} height={16} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="btn-group standee-btn-group">
          <motion.button className="btn btn-primary" onClick={copy} whileTap={{ scale: 0.97 }}>
            <CopyIcon width={18} height={18} /> {copied ? 'Link Copied!' : 'Copy Permanent Link'}
          </motion.button>
          <motion.button
            className="btn btn-pill"
            onClick={downloadPrintableStandee}
            disabled={downloading}
            whileTap={{ scale: 0.97 }}
          >
            <QrIcon width={18} height={18} /> {downloading ? 'Rendering Poster…' : '🖨️ Download Hero Standee'}
          </motion.button>
        </div>

        <div className="secondary-actions-row">
          <button type="button" className="link" onClick={handleRerollHero}>
            🎲 Surprise Me With Another Hero Card
          </button>
          {navigator.share && (
            <button type="button" className="link" onClick={handleShare}>
              📤 Share with Friends
            </button>
          )}
        </div>

        <p className="fine text-center" style={{ marginTop: '0.8rem' }}>
          💡 Tip: Print this Hero Standee or display it on your desk or shop counter. Senders don’t need an account to send you files!
        </p>
      </motion.section>
    </motion.div>
  );
}
