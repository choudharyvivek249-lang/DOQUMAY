import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT, formatSize, kindOf, validateFile } from '../utils/files';
import Avatar from './Avatar';
import { CloseIcon, FileIcon, UploadIcon } from './Icons';

const SENDER_NAME_KEY = 'documay:lastSenderName';

export default function DropBoxModal({
  targetUsername,
  defaultSenderName,
  onSendDrop,
  onClose,
  onComplete,
}) {
  const [targetInfo, setTargetInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [senderName, setSenderName] = useState(() => {
    return defaultSenderName || localStorage.getItem(SENDER_NAME_KEY) || '';
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState('');

  // 4-Digit Device Security PIN protection before first file share
  const [pinDigits, setPinDigits] = useState(() => {
    try {
      const stored = sessionStorage.getItem('documay:pin') || localStorage.getItem('documay:pin');
      if (stored && /^\d{4}$/.test(stored)) {
        return stored.split('');
      }
    } catch {}
    return ['', '', '', ''];
  });
  const [pinError, setPinError] = useState('');
  const pinInputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Fetch recipient's public profile info
  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(targetUsername)}`);
        const data = await res.json();
        if (data.ok) {
          setTargetInfo(data.user);
        } else {
          setError(data.error || 'Recipient not found.');
        }
      } catch {
        setError('Could not reach the DoquMay server.');
      } finally {
        setLoading(false);
      }
    }
    loadInfo();
  }, [targetUsername]);

  // Handle 4-digit PIN input changes with auto-advance and backspace
  const handlePinChange = (idx, value) => {
    setPinError('');
    const clean = value.replace(/[^0-9]/g, '');

    // Handle full 4-digit paste
    if (clean.length >= 4) {
      const parts = clean.slice(0, 4).split('');
      setPinDigits(parts);
      pinInputRefs[3].current?.focus();
      return;
    }

    const single = clean.slice(-1);
    const updated = [...pinDigits];
    updated[idx] = single;
    setPinDigits(updated);

    if (single && idx < 3) {
      pinInputRefs[idx + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !pinDigits[idx] && idx > 0) {
      pinInputRefs[idx - 1].current?.focus();
    }
  };

  const isPinComplete = pinDigits.every((d) => d !== '');

  const addFiles = (newFiles) => {
    const list = Array.from(newFiles || []);
    if (!list.length) return;
    for (const f of list) {
      const prob = validateFile(f);
      if (prob) {
        setError(`${f.name}: ${prob}`);
        return;
      }
    }
    setError('');
    setSelectedFiles((prev) => [...prev, ...list]);
    // Focus first PIN digit if not filled yet
    if (!isPinComplete) {
      setTimeout(() => pinInputRefs[0].current?.focus(), 200);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!selectedFiles.length) return;

    if (!isPinComplete) {
      setPinError('Please enter a 4-digit Security PIN to safely authorize document sharing.');
      pinInputRefs[0].current?.focus();
      return;
    }

    setSending(true);
    setError('');
    const finalSenderName = senderName.trim() || 'Guest Sender';
    try {
      localStorage.setItem(SENDER_NAME_KEY, finalSenderName);
      localStorage.setItem('documay:pin', pinStr);
      sessionStorage.setItem('documay:pin', pinStr);
    } catch { /* ignore */ }

    try {
      let count = 0;
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgressText(`Securing & sending ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        setProgressPercent(10);

        const res = await onSendDrop(
          targetUsername,
          file,
          finalSenderName,
          (offset, total) => {
            const pct = Math.min(98, Math.round((offset / total) * 100));
            setProgressPercent(pct);
          }
        );

        if (!res.ok) {
          setError(res.error || `Failed to deliver ${file.name}`);
          setSending(false);
          return;
        }
        count++;
      }
      setSentCount(count);
      setCompleted(true);
      setSelectedFiles([]);
      setProgressPercent(100);

      // Auto-navigate sender directly to WhatsApp Hub!
      setTimeout(() => {
        onComplete?.(finalSenderName, targetUsername);
      }, 600);
    } catch {
      setError('An error occurred during transfer. Please check connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      className="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="sheet drop-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Direct File Drop"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {/* Google Lens / QR Scanner badge */}
        <div className="google-lens-tag">
          <span>📷 Scanned via QR Standee / Google Lens</span>
        </div>

        {loading ? (
          <div className="drop-loading">
            <div className="wa-pulse-dot" style={{ width: 14, height: 14 }} />
            <p>Connecting to @{targetUsername}…</p>
          </div>
        ) : error && !targetInfo ? (
          <div className="drop-error">
            <h2>User Not Found</h2>
            <p className="lede">{error}</p>
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Recipient Profile Card */}
            <div className="drop-target-header">
              <Avatar name={targetInfo?.displayName || targetUsername} size={54} />
              <div className="drop-target-info">
                <h3>{targetInfo?.displayName || targetUsername}</h3>
                <span className="username-tag">@{targetUsername}</span>
                <span className={`status-badge ${targetInfo?.isOnline ? 'online' : 'dropbox'}`}>
                  {targetInfo?.isOnline ? '● Online in WhatsApp Hub' : '📦 24/7 Drop-box Active'}
                </span>
              </div>
            </div>

            <p className="lede text-center">
              Documents are secured with a 4-digit PIN and delivered directly into <b>@{targetUsername}’s WhatsApp Hub</b>.
            </p>

            {completed ? (
              /* Success confirmation state - Auto navigates to WhatsApp Hub */
              <div className="drop-success">
                <div className="success-icon">✓</div>
                <h3>Delivered to @{targetUsername}!</h3>
                <p className="fine">
                  <b>{sentCount} file{sentCount > 1 ? 's' : ''}</b> securely transferred. Opening your WhatsApp Hub conversation…
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onComplete?.(senderName.trim() || 'Guest Sender', targetUsername)}
                  style={{ width: '100%', marginTop: '12px' }}
                >
                  💬 Open WhatsApp Hub Now
                </button>
              </div>
            ) : (
              /* Drop form */
              <div className="drop-form">
                {error && <div className="auth-error">{error}</div>}

                <label className="field">
                  <span>Your Name (Sender)</span>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    maxLength={24}
                  />
                </label>

                {/* Mobile action buttons: Camera Snap & File Picker */}
                <div className="drop-picker-row">
                  <button
                    type="button"
                    className="drop-picker-btn"
                    onClick={() => cameraInputRef.current?.click()}
                    title="Take a photo with your camera"
                  >
                    <span className="drop-picker-icon">📸</span>
                    <b>Take Photo</b>
                    <span className="sub">Camera</span>
                  </button>

                  <button
                    type="button"
                    className="drop-picker-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Choose photos or documents from your phone"
                  >
                    <span className="drop-picker-icon">📁</span>
                    <b>Choose Files</b>
                    <span className="sub">Gallery or docs</span>
                  </button>

                  {/* Hidden inputs */}
                  <input
                    type="file"
                    ref={cameraInputRef}
                    onChange={(e) => addFiles(e.target.files)}
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => addFiles(e.target.files)}
                    accept={ACCEPT}
                    multiple
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Drag & Drop Area */}
                <div
                  className="drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <UploadIcon width={32} height={32} />
                  <b>
                    {selectedFiles.length
                      ? `${selectedFiles.length} file(s) selected`
                      : 'Tap here to browse documents & photos'}
                  </b>
                  <span className="fine">PNG, JPG, PDF, Word, Excel, PowerPoint (up to 100 MB)</span>
                </div>

                {/* Selected Files List with delete buttons */}
                {selectedFiles.length > 0 && (
                  <div className="selected-list">
                    {selectedFiles.map((f, i) => (
                      <div key={i} className="selected-item">
                        <FileIcon kind={kindOf(f.name)} size={22} />
                        <span className="selected-name" title={f.name}>
                          {f.name}
                        </span>
                        <span className="selected-size">{formatSize(f.size)}</span>
                        <button
                          type="button"
                          className="selected-remove"
                          onClick={() => removeFile(i)}
                          aria-label={`Remove ${f.name}`}
                        >
                          <CloseIcon width={12} height={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4-Digit Security PIN Section (Guarantees document & device safety) */}
                <div className="drop-pin-security-wrap" style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '18px',
                  padding: '14px',
                  margin: '10px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>🛡️</span>
                    <b style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                      4-Digit Device Security PIN
                    </b>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Enter any 4-digit PIN to secure your documents on this device before sending:
                  </span>

                  <div className="security-pin-inputs-row" style={{ margin: '4px 0' }}>
                    {pinDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={pinInputRefs[idx]}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handlePinChange(idx, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown(idx, e)}
                        disabled={sending}
                        className="security-pin-input-box"
                        style={{ width: '48px', height: '54px', fontSize: '1.6rem' }}
                        autoComplete="off"
                      />
                    ))}
                  </div>

                  {pinError && (
                    <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700 }}>
                      ⚠️ {pinError}
                    </span>
                  )}

                  {isPinComplete && (
                    <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                      🔒 Device PIN verified for this transfer
                    </span>
                  )}
                </div>

                {/* Live upload progress bar */}
                {sending && (
                  <div className="drop-progress-box">
                    <div className="drop-progress-labels">
                      <span className="drop-progress-text">{progressText}</span>
                      <span className="drop-progress-pct">{progressPercent}%</span>
                    </div>
                    <div className="drop-progress-bar">
                      <div
                        className="drop-progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <motion.button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={sending || selectedFiles.length === 0 || !isPinComplete}
                  whileTap={{ scale: 0.97 }}
                >
                  {sending
                    ? 'Securing & Sending…'
                    : !isPinComplete
                    ? 'Enter 4-Digit PIN to Send'
                    : `Send ${selectedFiles.length || ''} File(s) to @${targetUsername}`}
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
