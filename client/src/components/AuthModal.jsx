import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { CloseIcon, Logo } from './Icons';

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'recover'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [confirmPinDigits, setConfirmPinDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const confirmPinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const cleanUser = username.trim();
  const pinStr = pinDigits.join('');
  const confirmPinStr = confirmPinDigits.join('');

  const handleDigitChange = (digits, setDigits, refs, index, char) => {
    const digit = char.replace(/\D/g, '');

    // Full 4-digit paste
    if (digit.length >= 4) {
      const parts = digit.slice(0, 4).split('');
      setDigits(parts);
      refs[3].current?.focus();
      return;
    }

    const single = digit.slice(-1);
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

  const isReady =
    mode === 'login'
      ? cleanUser && password
      : cleanUser && password && pinStr.length === 4 && confirmPinStr.length === 4;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!cleanUser) return setError('Please enter a username.');
    if (!password) return setError('Please enter a password.');

    if (mode === 'register' || mode === 'recover') {
      if (pinStr.length !== 4) return setError('4-digit Send PIN must contain exactly 4 numeric digits.');
      if (confirmPinStr.length !== 4) return setError('Please confirm your 4-digit Send PIN.');
      if (pinStr !== confirmPinStr) return setError('4-digit Send PIN and confirmation do not match.');
    }

    setLoading(true);
    try {
      let endpoint = '/api/auth/login';
      let payload = { username: cleanUser, password };

      if (mode === 'register') {
        endpoint = '/api/auth/register';
        payload = {
          username: cleanUser,
          password,
          pin: pinStr,
          confirmPin: confirmPinStr,
          displayName: cleanUser,
        };
      } else if (mode === 'recover') {
        endpoint = '/api/auth/recover-pin';
        payload = {
          username: cleanUser,
          password,
          newPin: pinStr,
          confirmNewPin: confirmPinStr,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Something went wrong. Please check your credentials.');
        setLoading(false);
        return;
      }

      if (mode === 'recover') {
        // Recovery successful: switch to login mode with notification
        setMode('login');
        setError('');
        alert('✅ Send PIN recovered successfully! Please log in with your credentials.');
        setLoading(false);
        return;
      }

      // Plaintext PIN is NEVER stored in browser storage!
      onSuccess(data.user);
      onClose();
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet auth-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Account Login or Registration"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><CloseIcon /></button>

        <div className="auth-header">
          <Logo size={42} />
          <h2>
            {mode === 'register'
              ? 'Create Your Account'
              : mode === 'recover'
              ? 'Reset 4-Digit Send PIN'
              : 'Welcome Back'}
          </h2>
          <p className="lede">
            {mode === 'register'
              ? 'Set your permanent QR username, password, and secure 4-digit Send PIN.'
              : mode === 'recover'
              ? 'Enter your account password to set a new 4-digit Send PIN.'
              : 'Log in with your credentials to access your DoquMay Hub & permanent QR.'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error" role="alert">{error}</div>}

          <label className="field">
            <span>Username (Unique ID)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. rahul_sharma"
              maxLength={20}
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
              placeholder="Enter your account password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {/* 4-Digit Send PIN (Required for Register and Recovery) */}
          {(mode === 'register' || mode === 'recover') && (
            <>
              <div className="field pin-field-block">
                <label className="pin-field-label">
                  <span>🛡️ {mode === 'recover' ? 'New 4-Digit Send PIN' : 'Set 4-Digit Send PIN'}</span>
                  <span className="pin-field-hint">
                    Required for every outgoing file send (accepts leading zeroes, e.g. 0427)
                  </span>
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
                      aria-label={`PIN Digit ${i + 1}`}
                      required
                    />
                  ))}
                </div>
              </div>

              <div className="field pin-field-block">
                <label className="pin-field-label">
                  <span>🛡️ Confirm 4-Digit Send PIN</span>
                  <span className="pin-field-hint">Confirm your 4-digit PIN</span>
                </label>
                <div className="security-pin-inputs">
                  {confirmPinDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={confirmPinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(confirmPinDigits, setConfirmPinDigits, confirmPinRefs, i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(confirmPinDigits, confirmPinRefs, i, e)}
                      className={`pin-digit-box ${digit ? 'filled' : ''}`}
                      placeholder="•"
                      aria-label={`Confirm PIN Digit ${i + 1}`}
                      required
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !isReady}
            whileTap={{ scale: 0.97 }}
          >
            {loading
              ? 'Please wait…'
              : mode === 'register'
              ? 'Create Account & Set Send PIN'
              : mode === 'recover'
              ? 'Reset 4-Digit Send PIN'
              : 'Log In'}
          </motion.button>

          <div className="fine text-center" style={{ marginTop: '8px' }}>
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  className="link inline"
                  onClick={() => { setMode('recover'); setError(''); }}
                  style={{ display: 'block', margin: '4px auto' }}
                >
                  Forgot your 4-digit Send PIN? Reset here
                </button>
                <span>Don't have an account? </span>
                <button type="button" className="link inline" onClick={() => { setMode('register'); setError(''); }}>
                  Create one now
                </button>
              </>
            ) : mode === 'register' ? (
              <>
                <span>Already have an account? </span>
                <button type="button" className="link inline" onClick={() => { setMode('login'); setError(''); }}>
                  Log in here
                </button>
              </>
            ) : (
              <button type="button" className="link inline" onClick={() => { setMode('login'); setError(''); }}>
                Back to Log In
              </button>
            )}
          </div>
        </form>
      </motion.section>
    </motion.div>
  );
}
