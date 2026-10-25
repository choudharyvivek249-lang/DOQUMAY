import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { DoquMayLogo } from './Icons';

export default function WelcomeScreen({ onSubmit, onOpenAuth }) {
  const [value, setValue] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const clean = value.trim();
  const pinStr = pinDigits.join('');
  const isReady = clean.length > 0 && pinStr.length === 4;

  const handleDigitChange = (index, char) => {
    const digit = char.replace(/\D/g, '').slice(-1);
    const updated = [...pinDigits];
    updated[index] = digit;
    setPinDigits(updated);

    if (digit && index < 3) {
      pinRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setPinDigits(next);
    const focusIdx = Math.min(pasted.length, 3);
    pinRefs[focusIdx].current?.focus();
  };

  const submit = (e) => {
    e.preventDefault();
    if (isReady) {
      onSubmit(clean, pinStr);
    }
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
            required
          />
        </label>

        {/* 4-Digit Device Security PIN */}
        <div className="field pin-field-block">
          <label className="pin-field-label">
            <span>🛡️ 4-Digit Device Security PIN</span>
            <span className="pin-field-hint">Secures your device &amp; verifies document sharing</span>
          </label>
          <div className="security-pin-inputs" onPaste={handlePaste}>
            {pinDigits.map((digit, i) => (
              <input
                key={i}
                ref={pinRefs[i]}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`pin-digit-box ${digit ? 'filled' : ''}`}
                placeholder="•"
                aria-label={`PIN Digit ${i + 1}`}
                required
              />
            ))}
          </div>
        </div>

        <motion.button className="btn btn-primary" disabled={!isReady} whileTap={{ scale: 0.97 }}>
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
            <span className="sub">Get a Permanent QR Standee with 4-Digit Security PIN</span>
          </div>
        </motion.button>

        <p className="fine">Files are deleted automatically 10 minutes after they’re sent.</p>
      </motion.form>
    </motion.main>
  );
}
