import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { CloseIcon, Logo } from './Icons';

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const cleanUser = username.trim();
  const pinStr = pinDigits.join('');
  const isReady = cleanUser && password && pinStr.length === 4;

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!cleanUser) return setError('Please enter a username.');
    if (!password) return setError('Please enter a password.');
    if (pinStr.length !== 4) return setError('Please enter your 4-digit Security PIN.');

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password, pin: pinStr }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Something went wrong. Please check your credentials.');
        setLoading(false);
        return;
      }
      try {
        localStorage.setItem('documay:pin', pinStr);
        sessionStorage.setItem('documay:pin', pinStr);
      } catch {}
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
          <h2>{mode === 'register' ? 'Create Your Account' : 'Welcome Back'}</h2>
          <p className="lede">
            {mode === 'register'
              ? 'Get a permanent QR code with a 4-digit Security PIN that never expires!'
              : 'Log in with your credentials and 4-digit PIN to open your permanent WhatsApp Hub.'}
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
              placeholder="e.g. vivek_sharma"
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
              placeholder="Enter your password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {/* 4-Digit Security PIN */}
          <div className="field pin-field-block">
            <label className="pin-field-label">
              <span>🛡️ {mode === 'register' ? 'Set 4-Digit Security PIN' : '4-Digit Security PIN'}</span>
              <span className="pin-field-hint">
                {mode === 'register'
                  ? 'Secures your standee QR code & verifies document transfers'
                  : 'Enter your 4-digit PIN to unlock document transfers'}
              </span>
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

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !isReady}
            whileTap={{ scale: 0.97 }}
          >
            {loading ? 'Please wait…' : mode === 'register' ? 'Create Account & Get Permanent QR' : 'Log In & Open WhatsApp Hub'}
          </motion.button>

          <p className="fine text-center">
            {mode === 'register' ? (
              <>Already have an account? <button type="button" className="link inline" onClick={() => setMode('login')}>Log in here</button></>
            ) : (
              <>Don't have an account? <button type="button" className="link inline" onClick={() => setMode('register')}>Create one in 10 seconds</button></>
            )}
          </p>
        </form>
      </motion.section>
    </motion.div>
  );
}
