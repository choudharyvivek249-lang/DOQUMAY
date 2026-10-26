import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './Icons';

/**
 * Clean, mobile-friendly 4-Digit Send PIN Verification Screen.
 * Modeled after familiar, secure PIN-based fintech payment applications
 * without copying UPI branding.
 */
export default function SendPinModal({
  recipient,
  filesCount = 1,
  totalSize = 0,
  onVerify,
  onForgotPin,
  onClose,
}) {
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [shake, setShake] = useState(false);

  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Focus first digit box on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs[0].current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return undefined;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handleDigitChange = (index, char) => {
    if (lockoutSeconds > 0) return;
    setError('');

    // Handle full 4-digit paste in any input
    const cleanDigits = char.replace(/\D/g, '');
    if (cleanDigits.length >= 4) {
      const parts = cleanDigits.slice(0, 4).split('');
      setPinDigits(parts);
      inputRefs[3].current?.focus();
      triggerVerification(parts.join(''));
      return;
    }

    const singleDigit = cleanDigits.slice(-1);
    const updated = [...pinDigits];
    updated[index] = singleDigit;
    setPinDigits(updated);

    if (singleDigit && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto-verify when 4th digit is entered
    if (singleDigit && index === 3 && updated.every((d) => d !== '')) {
      triggerVerification(updated.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setPinDigits(next);

    const focusIdx = Math.min(pasted.length, 3);
    inputRefs[focusIdx].current?.focus();

    if (pasted.length === 4) {
      triggerVerification(pasted);
    }
  };

  const handleKeypadPress = (val) => {
    if (lockoutSeconds > 0 || loading) return;
    setError('');

    if (val === 'backspace') {
      const lastFilled = pinDigits.map((d) => Boolean(d)).lastIndexOf(true);
      if (lastFilled >= 0) {
        const next = [...pinDigits];
        next[lastFilled] = '';
        setPinDigits(next);
        inputRefs[lastFilled].current?.focus();
      }
      return;
    }

    const firstEmpty = pinDigits.findIndex((d) => d === '');
    if (firstEmpty >= 0) {
      const next = [...pinDigits];
      next[firstEmpty] = val;
      setPinDigits(next);

      if (firstEmpty < 3) {
        inputRefs[firstEmpty + 1].current?.focus();
      } else if (next.every((d) => d !== '')) {
        triggerVerification(next.join(''));
      }
    }
  };

  const triggerVerification = async (pinString) => {
    if (loading || lockoutSeconds > 0) return;
    if (pinString.length !== 4) {
      setError('Please enter all 4 digits of your Send PIN.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await onVerify(pinString);
      if (!res?.ok) {
        setShake(true);
        setTimeout(() => setShake(false), 500);

        if (res?.locked || res?.remainingSeconds > 0) {
          setLockoutSeconds(res.remainingSeconds || 300);
          setError(res.error || 'Account temporarily locked due to repeated incorrect attempts.');
        } else {
          setError(res?.error || 'Incorrect 4-digit Send PIN. Please try again.');
        }
        setPinDigits(['', '', '', '']);
        setTimeout(() => inputRefs[0].current?.focus(), 100);
      }
    } catch {
      setError('Unable to verify PIN. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const isComplete = pinDigits.every((d) => d !== '');

  return (
    <motion.div
      className="backdrop center-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="pin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Enter 4-Digit Send PIN"
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
          aria-label="Cancel Send"
        >
          <CloseIcon width={18} height={18} />
        </button>

        {/* Header Shield & Recipient Info */}
        <div className="pin-modal-header">
          <div className="pin-shield-badge">
            <span className="pin-shield-icon">🛡️</span>
          </div>
          <h2 className="pin-modal-title">Enter 4-Digit Send PIN</h2>
          <p className="pin-modal-subtitle">
            Authorize sending {filesCount} file{filesCount > 1 ? 's' : ''} to{' '}
            <span className="pin-recipient-name">@{recipient.replace(/^@/, '')}</span>
          </p>
        </div>

        {/* Lockout or Error Alerts */}
        <AnimatePresence>
          {lockoutSeconds > 0 ? (
            <motion.div
              className="pin-alert-box lockout"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="pin-alert-icon">⏳</span>
              <div>
                <b>Account Temporarily Locked</b>
                <p>
                  Too many incorrect attempts. Please wait <b>{lockoutSeconds}s</b> before trying again.
                </p>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              className="pin-alert-box error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="pin-alert-icon">⚠️</span>
              <span>{error}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 4-Digit PIN Input Boxes */}
        <div
          className={`pin-boxes-row ${shake ? 'pin-shake' : ''}`}
          onPaste={handlePaste}
        >
          {pinDigits.map((digit, idx) => (
            <input
              key={idx}
              ref={inputRefs[idx]}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              disabled={loading || lockoutSeconds > 0}
              className={`pin-single-input ${digit ? 'filled' : ''} ${error ? 'has-error' : ''}`}
              placeholder="•"
              aria-label={`PIN Digit ${idx + 1}`}
              autoComplete="off"
            />
          ))}
        </div>

        {/* Visual Numeric Keypad for Mobile Convenience */}
        <div className="pin-keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              className="pin-key-btn"
              onClick={() => handleKeypadPress(String(num))}
              disabled={loading || lockoutSeconds > 0}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            className="pin-key-btn helper-key"
            onClick={onForgotPin}
            title="Forgot Send PIN?"
            disabled={loading}
          >
            Forgot?
          </button>
          <button
            key={0}
            type="button"
            className="pin-key-btn"
            onClick={() => handleKeypadPress('0')}
            disabled={loading || lockoutSeconds > 0}
          >
            0
          </button>
          <button
            type="button"
            className="pin-key-btn helper-key backspace"
            onClick={() => handleKeypadPress('backspace')}
            disabled={loading || lockoutSeconds > 0}
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        {/* Authorize & Send Button */}
        <motion.button
          type="button"
          className="btn btn-primary pin-submit-btn"
          onClick={() => triggerVerification(pinDigits.join(''))}
          disabled={loading || !isComplete || lockoutSeconds > 0}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? (
            <span className="pin-loading-spinner">Verifying PIN…</span>
          ) : (
            `🔒 Authorize & Send`
          )}
        </motion.button>

        <div className="pin-modal-foot">
          <span className="pin-security-text">
            🛡️ Protected by DoquMay Salted Send PIN · Never shared or exposed
          </span>
          {onForgotPin && (
            <button
              type="button"
              className="link pin-forgot-link"
              onClick={onForgotPin}
            >
              Forgot your 4-digit PIN? Reset with password
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
