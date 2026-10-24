import { motion } from 'framer-motion';
import Avatar from './Avatar';
import { QrIcon, ScanIcon } from './Icons';

export default function HomeScreen({ name, connected, onScan, onMyQr, onChangeName }) {
  return (
    <motion.main className="screen home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="topbar">
        <Avatar name={name} size={46} />
        <div className="who">
          <span className="hello">Hi,</span>
          <b>{name}</b>
        </div>
        <span className={`status-dot ${connected ? 'on' : ''}`} role="status" aria-label={connected ? 'Online' : 'Connecting'}>{connected ? 'Online' : 'Connecting…'}</span>
      </header>

      <section className="hero">
        <motion.button className="scan-btn" onClick={onScan} disabled={!connected} whileTap={{ scale: 0.94 }} aria-label="Scan QR">
          <ScanIcon width={54} height={54} strokeWidth={1.8} />
          <span>Scan QR</span>
        </motion.button>
        <p className="hint">Point your camera at a friend’s Documay code to send them a file.</p>
      </section>

      <motion.button className="btn btn-pill" onClick={onMyQr} disabled={!connected} whileTap={{ scale: 0.97 }}>
        <QrIcon width={22} height={22} /> My QR Code
      </motion.button>

      <footer className="home-foot">
        <p className="fine">No account · Files auto-delete after 10 minutes</p>
        <button className="link" onClick={onChangeName}>Not {name.split(' ')[0]}? Change name</button>
      </footer>
    </motion.main>
  );
}
