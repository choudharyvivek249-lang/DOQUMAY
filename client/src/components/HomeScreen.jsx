import { motion } from 'framer-motion';
import Avatar from './Avatar';
import { QrIcon, ScanIcon } from './Icons';

export default function HomeScreen({
  name,
  account,
  connected,
  dropsCount = 0,
  onScan,
  onMyQr,
  onPermanentQr,
  onOpenInbox,
  onAuth,
  onLogout,
  onChangeName,
}) {
  return (
    <motion.main className="screen home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="topbar">
        <Avatar name={account?.displayName || name} size={46} />
        <div className="who">
          <span className="hello">Hi,</span>
          <b>{account?.displayName || name}</b>
          {account?.username && <span className="account-tag">@{account.username}</span>}
        </div>
        <span
          className={`status-dot ${connected ? 'on' : ''}`}
          role="status"
          aria-label={connected ? 'Online' : 'Connecting'}
        >
          {connected ? 'Online' : 'Connecting…'}
        </span>
      </header>

      {/* Drop-box Inbox Alert Banner */}
      {dropsCount > 0 && (
        <motion.div
          className="inbox-banner"
          onClick={onOpenInbox}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="inbox-badge">{dropsCount}</span>
          <div className="inbox-banner-text">
            <b>{dropsCount} file{dropsCount > 1 ? 's' : ''} in your Drop-box!</b>
            <span>Tap to preview or download</span>
          </div>
          <span className="inbox-arrow">→</span>
        </motion.div>
      )}

      <section className="hero">
        <motion.button
          className="scan-btn"
          onClick={onScan}
          disabled={!connected}
          whileTap={{ scale: 0.94 }}
          aria-label="Scan QR Code"
        >
          <ScanIcon width={54} height={54} strokeWidth={1.8} />
          <span>Scan QR</span>
        </motion.button>
        <p className="hint">Point your camera at any temporary or permanent Documay code to transfer files.</p>
      </section>

      <div className="qr-options-grid">
        {account ? (
          <>
            <motion.button
              className="btn btn-permanent"
              onClick={onPermanentQr}
              disabled={!connected}
              whileTap={{ scale: 0.97 }}
            >
              <span className="perm-star">✨</span>
              <div className="btn-col">
                <b>Permanent QR Code</b>
                <span className="sub">Never expires · @{account.username}</span>
              </div>
            </motion.button>

            <div className="action-row">
              <motion.button
                className="btn btn-pill"
                onClick={onMyQr}
                disabled={!connected}
                whileTap={{ scale: 0.97 }}
              >
                <QrIcon width={18} height={18} /> Temp QR (2 min)
              </motion.button>
              <motion.button
                className="btn btn-pill"
                onClick={onOpenInbox}
                whileTap={{ scale: 0.97 }}
              >
                📦 Drop-box {dropsCount > 0 ? `(${dropsCount})` : ''}
              </motion.button>
            </div>
          </>
        ) : (
          <>
            <motion.button
              className="btn btn-pill"
              onClick={onMyQr}
              disabled={!connected}
              whileTap={{ scale: 0.97 }}
            >
              <QrIcon width={22} height={22} /> My QR Code (2 min)
            </motion.button>

            <motion.button
              className="btn btn-permanent-outline"
              onClick={onAuth}
              whileTap={{ scale: 0.97 }}
            >
              <span>✨</span>
              <div className="btn-col">
                <b>Get a Permanent QR Code</b>
                <span className="sub">Free 10-second account</span>
              </div>
            </motion.button>
          </>
        )}
      </div>

      <footer className="home-foot">
        <p className="fine">Files auto-delete after 10 minutes</p>
        <div className="footer-links">
          {account ? (
            <>
              <button className="link" onClick={onPermanentQr}>My Link</button>
              <span>·</span>
              <button className="link" onClick={onLogout}>Log Out</button>
            </>
          ) : (
            <>
              <button className="link" onClick={onChangeName}>Change name</button>
              <span>·</span>
              <button className="link" onClick={onAuth}>Log in / Sign up</button>
            </>
          )}
        </div>
      </footer>
    </motion.main>
  );
}
