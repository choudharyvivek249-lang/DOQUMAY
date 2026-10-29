import { motion } from 'framer-motion';
import { useState } from 'react';
import { CloseIcon, Logo } from './Icons';

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cleanUser = username.trim();
  const isReady = cleanUser && password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!cleanUser) return setError('Please enter a username.');
    if (!password) return setError('Please enter a password.');

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = mode === 'register'
        ? { username: cleanUser, password, displayName: cleanUser }
        : { username: cleanUser, password };

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
            {mode === 'register' ? 'Create Your Account' : 'Welcome Back'}
          </h2>
          <p className="lede">
            {mode === 'register'
              ? 'Set your permanent QR username and password to start receiving documents.'
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

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !isReady}
            whileTap={{ scale: 0.97 }}
          >
            {loading
              ? 'Please wait…'
              : mode === 'register'
              ? 'Create Account & Standee QR'
              : 'Log In'}
          </motion.button>

          <div className="fine text-center" style={{ marginTop: '8px' }}>
            {mode === 'login' ? (
              <>
                <span>Don't have an account? </span>
                <button type="button" className="link inline" onClick={() => { setMode('register'); setError(''); }}>
                  Create one now
                </button>
              </>
            ) : (
              <>
                <span>Already have an account? </span>
                <button type="button" className="link inline" onClick={() => { setMode('login'); setError(''); }}>
                  Log in here
                </button>
              </>
            )}
          </div>
        </form>
      </motion.section>
    </motion.div>
  );
}
