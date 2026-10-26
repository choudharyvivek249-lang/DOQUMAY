import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { DoquMayLogo } from './Icons';

export default function WelcomeScreen({ onAccountCreated, onOpenAuth }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [confirmDigits, setConfirmDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const confirmRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const pinStr = pinDigits.join('');
  const confirmPinStr = confirmDigits.join('');

  const isReady =
    cleanUser.length >= 3 &&
    password.length >= 4 &&
    pinStr.length === 4 &&
    confirmPinStr.length === 4;

  const handleDigitChange = (digits, setDigits, refs, index, char) => {
    setError('');
    const clean = char.replace(/\D/g, '');

    if (clean.length >= 4) {
      const parts = clean.slice(0, 4).split('');
      setDigits(parts);
      refs[3].current?.focus();
      return;
    }

    const single = clean.slice(-1);
    const updated = [...digits];
    updated[index] = single;
    setDigits(updated);

    if (single && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (digits, refs, index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (cleanUser.length < 3) return setError('Username must be at least 3 characters.');
    if (password.length < 4) return setError('Password must be at least 4 characters.');
    if (pinStr.length !== 4) return setError('Send PIN must contain exactly 4 numeric digits.');
    if (confirmPinStr.length !== 4) return setError('Please confirm your 4-digit Send PIN.');
    if (pinStr !== confirmPinStr) return setError('4-digit Send PIN and confirmation do not match.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          password,
          pin: pinStr,
          confirmPin: confirmPinStr,
          displayName: username.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to create account. Please try another username.');
        setLoading(false);
        return;
      }

      // Successful first-time setup!
      onAccountCreated(data.user);
    } catch {
      setError('Cannot reach server. Please check your internet connection.');
    } finally {
      setLoading(false);
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
          Send photos and documents instantly with a QR scan &amp; WhatsApp handoff.
          <br />
          <span className="welcome-not-money">📄 For Documents &amp; Files · Not For Money</span>
        </p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <label className="field">
          <span>Choose Your Username / ID</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            placeholder="e.g. rahul_sharma"
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            autoComplete="new-password"
            required
          />
        </label>

        {/* 4-Digit Personal Send PIN */}
        <div className="field pin-field-block">
          <label className="pin-field-label">
            <span>🛡️ Personal 4-Digit Send PIN</span>
            <span className="pin-field-hint">Required whenever you send files (accepts leading zeroes, e.g. 0427)</span>
          </label>
          <div className="security-pin-inputs">
            {pinDigits.map((digit, i) => (
              <input
                key={i}
                ref={pinRefs[i]}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(pinDigits, setPinDigits, pinRefs, i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(pinDigits, pinRefs, i, e)}
                className={`pin-digit-box ${digit ? 'filled' : ''}`}
                placeholder="•"
                aria-label={`Send PIN Digit ${i + 1}`}
                required
              />
            ))}
          </div>
        </div>

        {/* Confirm 4-Digit Send PIN */}
        <div className="field pin-field-block">
          <label className="pin-field-label">
            <span>🛡️ Confirm 4-Digit Send PIN</span>
            <span className="pin-field-hint">Re-enter your 4-digit PIN</span>
          </label>
          <div className="security-pin-inputs">
            {confirmDigits.map((digit, i) => (
              <input
                key={i}
                ref={confirmRefs[i]}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(confirmDigits, setConfirmDigits, confirmRefs, i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(confirmDigits, confirmRefs, i, e)}
                className={`pin-digit-box ${digit ? 'filled' : ''}`}
                placeholder="•"
                aria-label={`Confirm PIN Digit ${i + 1}`}
                required
              />
            ))}
          </div>
        </div>

        <motion.button
          type="submit"
          className="btn btn-primary"
          disabled={!isReady || loading}
          whileTap={{ scale: 0.97 }}
        >
          {loading ? 'Setting Up Account…' : '⚡ Start Sending with DoquMay'}
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
            <b>Already Have an Account? Log In</b>
            <span className="sub">Preserves your existing 4-digit PIN &amp; Permanent QR</span>
          </div>
        </motion.button>

        <p className="fine">Files are deleted automatically 10 minutes after they’re sent.</p>
      </motion.form>
    </motion.main>
  );
}
