import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { CloseIcon } from './Icons';

/**
 * Authenticated PIN-change and recovery modal.
 * Allows logged-in users to update their personal 4-digit Send PIN securely
 * or recover it using their account password.
 */
export default function PinChangeModal({ account, onClose, onSuccess, notify }) {
  const [mode, setMode] = useState('change'); // 'change' | 'recover'
  const [currentCred, setCurrentCred] = useState('');
  const [newPinDigits, setNewPinDigits] = useState(['', '', '', '']);
  const [confirmPinDigits, setConfirmPinDigits] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const newRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const confirmRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const newPinStr = newPinDigits.join('');
  const confirmPinStr = confirmPinDigits.join('');

  const handleDigitChange = (digits, setDigits, refs, idx, char) => {
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
    updated[idx] = single;
    setDigits(updated);

    if (single && idx < 3) {
      refs[idx + 1].current?.focus();
    }
  };

  const handleKeyDown = (digits, refs, idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentCred) {
      setError(mode === 'change' ? 'Please enter your current password or PIN.' : 'Please enter your account password.');
      return;
    }
    if (newPinStr.length !== 4) {
      setError('New Send PIN must be exactly 4 numeric digits.');
      return;
    }
    if (confirmPinStr.length !== 4) {
      setError('Please confirm your new 4-digit Send PIN.');
      return;
    }
    if (newPinStr !== confirmPinStr) {
      setError('New Send PIN and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'change') {
        const res = await fetch('/api/auth/change-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-user': account.username,
            'x-auth-token': account.token,
          },
          body: JSON.stringify({
            currentCredential: currentCred,
            newPin: newPinStr,
            confirmNewPin: confirmPinStr,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to update PIN. Please check your credentials.');
          return;
        }
        notify?.('✅ Your 4-digit Send PIN has been updated successfully!');
        onSuccess?.();
        onClose();
      } else {
        // Recovery with password
        const res = await fetch('/api/auth/recover-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: account.username,
            password: currentCred,
            newPin: newPinStr,
            confirmNewPin: confirmPinStr,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to reset PIN. Please check your password.');
          return;
        }
        notify?.('✅ Your 4-digit Send PIN has been reset successfully!');
        onSuccess?.();
        onClose();
      }
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="backdrop center-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="pin-modal-card pin-change-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Manage 4-Digit Send PIN"
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn close pin-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon width={18} height={18} />
        </button>

        <div className="pin-modal-header">
          <div className="pin-shield-badge">
            <span className="pin-shield-icon">🛡️</span>
          </div>
          <h2 className="pin-modal-title">
            {mode === 'change' ? 'Change 4-Digit Send PIN' : 'Reset Send PIN with Password'}
          </h2>
          <p className="pin-modal-subtitle">
            Account: <b>@{account?.username}</b>
          </p>
        </div>

        {error && <div className="pin-alert-box error"><span>⚠️ {error}</span></div>}

        <form onSubmit={handleSubmit} className="pin-change-form">
          <label className="field">
            <span>{mode === 'change' ? 'Current Password or Current PIN' : 'Account Password'}</span>
            <input
              type="password"
              value={currentCred}
              onChange={(e) => setCurrentCred(e.target.value)}
              placeholder={mode === 'change' ? 'Enter current password or PIN' : 'Enter account password'}
              autoFocus
              required
            />
          </label>

          <div className="field pin-field-block">
            <label className="pin-field-label">
              <span>New 4-Digit Send PIN</span>
              <span className="pin-field-hint">Accepts leading zeroes (e.g. 0427)</span>
            </label>
            <div className="security-pin-inputs">
              {newPinDigits.map((d, i) => (
                <input
                  key={i}
                  ref={newRefs[i]}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(newPinDigits, setNewPinDigits, newRefs, i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(newPinDigits, newRefs, i, e)}
                  className={`pin-digit-box ${d ? 'filled' : ''}`}
                  placeholder="•"
                  required
                />
              ))}
            </div>
          </div>

          <div className="field pin-field-block">
            <label className="pin-field-label">
              <span>Confirm New 4-Digit Send PIN</span>
            </label>
            <div className="security-pin-inputs">
              {confirmPinDigits.map((d, i) => (
                <input
                  key={i}
                  ref={confirmRefs[i]}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(confirmPinDigits, setConfirmPinDigits, confirmRefs, i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(confirmPinDigits, confirmRefs, i, e)}
                  className={`pin-digit-box ${d ? 'filled' : ''}`}
                  placeholder="•"
                  required
                />
              ))}
            </div>
          </div>

          <motion.button
            type="submit"
            className="btn btn-primary pin-submit-btn"
            disabled={loading || newPinStr.length !== 4 || confirmPinStr.length !== 4 || !currentCred}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Updating…' : mode === 'change' ? 'Update Send PIN' : 'Reset Send PIN'}
          </motion.button>

          <div className="text-center" style={{ marginTop: '8px' }}>
            {mode === 'change' ? (
              <button
                type="button"
                className="link"
                onClick={() => { setMode('recover'); setError(''); setCurrentCred(''); }}
              >
                Forgot your current PIN? Reset with password
              </button>
            ) : (
              <button
                type="button"
                className="link"
                onClick={() => { setMode('change'); setError(''); setCurrentCred(''); }}
              >
                Back to normal PIN change
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
