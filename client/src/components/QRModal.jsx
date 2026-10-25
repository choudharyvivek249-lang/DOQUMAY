import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { formatCountdown } from '../utils/files';
import { getHeroForSeed, getRandomHero } from '../utils/heroCards';
import { useCountdown } from '../utils/useTick';
import { CloseIcon, CopyIcon, DOQUMAY_QR_LOGO_DATA_URI, DoquMayLogo, RefreshIcon } from './Icons';

const QR_LIFETIME = 120000;

export default function QRModal({ qr, name, onRefresh, onClose }) {
  const left = useCountdown(qr?.expiresAt);
  const expired = Boolean(qr) && left <= 0;
  const [copied, setCopied] = useState(false);
  const [hero, setHero] = useState(() => getHeroForSeed(name || 'guest'));
  const [cardRevealed, setCardRevealed] = useState(true);

  useEffect(() => {
    onRefresh();
  }, []);

  const handleRerollHero = () => {
    setCardRevealed(false);
    setTimeout(() => {
      setHero((prev) => getRandomHero(prev.id));
      setCardRevealed(true);
    }, 150);
  };

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
        className="sheet hero-qr-sheet"
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

        {/* Global DoquMay Tagline Banner */}
        <div className="doqumay-tagline-badge">
          <span className="sparkle-icon">⚡</span>
          <span className="tagline-text">WORLD’S 1ST FASTEST &amp; EASIEST DOCUMENT SENDER</span>
          <span className="sparkle-icon">⚡</span>
        </div>

        {/* Pay-App Standee Header */}
        <div className="standee-header">
          <DoquMayLogo size={42} showTagline={false} />
          <div className="standee-title-wrap">
            <h2 className="brand-h2">
              <span className="brand-doqu">Doqu</span>
              <span className="brand-may">May</span>
              <span className="standee-verified-badge" title="Verified Instant Transfer">✓ Verified</span>
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
              className="surprise-hero-card"
              style={{
                background: hero.theme.cardBg,
                borderColor: hero.theme.primary,
                boxShadow: `0 8px 32px ${hero.theme.glow}`,
              }}
              initial={{ scale: 0.92, opacity: 0, rotateY: 15 }}
              animate={{ scale: 1, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.92, opacity: 0, rotateY: -15 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            >
              {/* Card Top: Superhero info & Rarity */}
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
                  🎲 <span className="reroll-label">Reroll Hero</span>
                </button>
              </div>

              {/* Character Catchphrase */}
              <p className="hero-quote" style={{ borderLeftColor: hero.theme.primary }}>
                {hero.quote}
              </p>

              {/* QR Code Container with Center DoquMay Logo */}
              <div className={`qr-box hero-qr-box ${expired ? 'dead' : ''}`} style={{ borderColor: hero.theme.primary }}>
                {qr ? (
                  <div className="qr-inner-wrapper">
                    <QRCodeSVG
                      value={qr.link}
                      size={210}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#111111"
                      marginSize={2}
                      imageSettings={{
                        src: DOQUMAY_QR_LOGO_DATA_URI,
                        height: 44,
                        width: 44,
                        excavate: true,
                      }}
                    />
                    {/* Glowing overlay logo for 100% crisp visual pop */}
                    <div className="qr-center-logo-overlay">
                      <DoquMayLogo size={34} />
                    </div>
                  </div>
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

              {/* Hero Stats Footer */}
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
                  <span className="stat-label">⏱️ Auto-Delete</span>
                  <b className="stat-value">10 Minutes</b>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scan instruction */}
        <p className="hero-scan-hint">
          Scan with <b>Phone Camera</b>, <b>Google Lens</b>, or <b>DoquMay</b> to send files.
        </p>

        {/* Footer timer & actions */}
        {expired ? (
          <motion.button className="btn btn-primary" onClick={onRefresh} whileTap={{ scale: 0.97 }}>
            <RefreshIcon width={20} height={20} /> Refresh QR Code
          </motion.button>
        ) : qr ? (
          <>
            <div className="timer-section">
              <p className="timer" role="timer" aria-live="off">
                Code expires in <b>{formatCountdown(left)}</b>
              </p>
              <div className="timer-bar">
                <i style={{ width: `${Math.min(100, (left / QR_LIFETIME) * 100)}%` }} />
              </div>
            </div>

            <div className="modal-actions-row">
              <button type="button" className="btn btn-pill" onClick={copy}>
                <CopyIcon width={16} height={16} /> {copied ? 'Link Copied!' : 'Copy Link Instead'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleRerollHero}>
                🎲 Draw Surprise Hero
              </button>
            </div>
          </>
        ) : (
          <p className="timer">Creating your DoquMay code…</p>
        )}
      </motion.section>
    </motion.div>
  );
}
