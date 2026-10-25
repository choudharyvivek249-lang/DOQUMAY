import { motion } from 'framer-motion';
import { useState } from 'react';
import { DoquMayLogo } from './Icons';

export default function WelcomeScreen({ onSubmit, onOpenAuth }) {
  const [value, setValue] = useState('');
  const clean = value.trim();
  const submit = (e) => {
    e.preventDefault();
    if (clean) onSubmit(clean);
  };

  return (
    <motion.main
      className="screen center welcome-screen-bg"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.form
        className="welcome"
        onSubmit={submit}
        initial={false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
      >
        <DoquMayLogo size={76} />

        <div className="welcome-brand-header">
          <h1 className="welcome-h1">
            <span className="brand-doqu">Doqu</span>
            <span className="brand-may">May</span>
          </h1>
          <div className="welcome-tagline-badge">
            ⚡ WORLD’S 1ST FASTEST &amp; EASIEST DOCUMENT SENDER
          </div>
        </div>

        <p className="lede">
          Send photos and documents instantly with a QR scan. Ephemeral, 100% secure, zero login.
          <br />
          <span className="welcome-not-money">📄 For Documents &amp; Files · Not For Money</span>
        </p>

        <label className="field">
          <span>Quick Guest Display Name</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={24}
            placeholder="e.g. Rahul Sharma"
            autoComplete="nickname"
            autoFocus
          />
        </label>

        <motion.button className="btn btn-primary" disabled={!clean} whileTap={{ scale: 0.97 }}>
          ⚡ Start Sending with DoquMay
        </motion.button>

        <div className="welcome-divider">
          <span>or</span>
        </div>

        <motion.button
          type="button"
          className="btn btn-permanent-outline"
          onClick={onOpenAuth}
          whileTap={{ scale: 0.97 }}
        >
          <span>✨</span>
          <div className="btn-col">
            <b>Log In / Create Free Account</b>
            <span className="sub">Get a Permanent QR Standee that never expires</span>
          </div>
        </motion.button>

        <p className="fine">Files are deleted automatically 10 minutes after they’re sent.</p>
      </motion.form>
    </motion.main>
  );
}
