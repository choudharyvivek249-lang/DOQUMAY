import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * 4-Digit Security PIN Handshake
 * Ensures documents and devices are 100% safe by requiring mutual PIN verification
 * before any files can be transferred between two users.
 */
export default function SecurityPinHandshake({
  room,
  onVerifyPin,
  onAuthorizeHost,
  onCancel,
}) {
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Auto-focus first input on scanner device
  useEffect(() => {
    if (!room.isHost) {
      setTimeout(() => inputRefs[0].current?.focus(), 150);
    }
  }, [room.isHost]);

  const handleDigitChange = (index, value) => {
    setErrorMsg('');
    const clean = value.replace(/[^0-9]/g, '');

    // Handle full 4-digit paste
    if (clean.length >= 4) {
      const parts = clean.slice(0, 4).split('');
      setPinDigits(parts);
      inputRefs[3].current?.focus();
      submitPin(parts.join(''));
      return;
    }

    const single = clean.slice(-1);
    const updated = [...pinDigits];
    updated[index] = single;
    setPinDigits(updated);

    if (single && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto submit on 4th digit
    if (single && index === 3 && updated.every((d) => d !== '')) {
      submitPin(updated.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const submitPin = async (code) => {
    if (submitting || success) return;
    setSubmitting(true);
    setErrorMsg('');

    const res = await onVerifyPin(code);
    setSubmitting(false);

    if (res?.ok) {
      setSuccess(true);
    } else {
      setErrorMsg(res?.error || 'Incorrect 4-digit PIN. Please check the other device.');
      // Clear digits on error
      setPinDigits(['', '', '', '']);
      inputRefs[0].current?.focus();
    }
  };

  const handleHostQuickAuthorize = async () => {
    setSubmitting(true);
    const res = await onAuthorizeHost();
    setSubmitting(false);
    if (res?.ok) {
      setSuccess(true);
    }
  };

  return (
    <motion.div
      className="security-pin-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="security-pin-card"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      >
        <div className="security-pin-shield-wrap">
          <span className="security-shield-icon">🛡️</span>
        </div>

        <h3 className="security-pin-title">Device Security Verification</h3>
        <p className="security-pin-desc">
          DoquMay protects your device and documents. Verify the 4-digit security PIN before transferring files with{' '}
          <b>{room.peer?.name || 'Partner'}</b>.
        </p>

        {success ? (
          <motion.div
            className="security-pin-success-box"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <span className="security-check-icon">✅</span>
            <b>Device Security Verified!</b>
            <span>Unlocking safe document transfer…</span>
          </motion.div>
        ) : room.isHost ? (
          /* Host Device Screen: Displays the 4-Digit Security PIN */
          <div className="security-host-view">
            <span className="security-view-label">
              Share this 4-digit PIN with <b>{room.peer?.name}</b>:
            </span>

            <div className="security-pin-digits-row">
              {String(room.pin || '----')
                .split('')
                .map((digit, idx) => (
                  <div key={idx} className="security-pin-display-box">
                    {digit}
                  </div>
                ))}
            </div>

            <div className="security-waiting-badge">
              <span className="pulse-indicator" />
              <span>Waiting for {room.peer?.name} to enter PIN on their phone…</span>
            </div>

            <button
              type="button"
              className="btn btn-ghost soft btn-quick-authorize"
              onClick={handleHostQuickAuthorize}
              disabled={submitting}
            >
              ⚡ Using both devices yourself? Tap to Authorize
            </button>
          </div>
        ) : (
          /* Scanner / Peer Device Screen: Enters the 4-Digit Security PIN */
          <div className="security-scanner-view">
            <span className="security-view-label">
              Enter the 4-digit PIN shown on <b>{room.peer?.name}</b>'s screen:
            </span>

            <div className="security-pin-inputs-row">
              {pinDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={inputRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={submitting}
                  className="security-pin-input-box"
                  autoComplete="off"
                />
              ))}
            </div>

            {errorMsg && (
              <motion.div
                className="security-pin-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ⚠️ {errorMsg}
              </motion.div>
            )}

            <button
              type="button"
              className="btn btn-primary soft btn-verify-pin"
              onClick={() => submitPin(pinDigits.join(''))}
              disabled={submitting || pinDigits.some((d) => !d)}
            >
              {submitting ? 'Verifying PIN…' : 'Unlock Safe Transfer'}
            </button>
          </div>
        )}

        <button type="button" className="security-pin-cancel-btn" onClick={onCancel}>
          Cancel Transfer
        </button>
      </motion.div>
    </motion.div>
  );
}
