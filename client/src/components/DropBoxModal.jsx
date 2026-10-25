import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT, formatSize, kindOf, validateFile } from '../utils/files';
import Avatar from './Avatar';
import { CloseIcon, FileIcon, UploadIcon } from './Icons';

const SENDER_NAME_KEY = 'documay:lastSenderName';

export default function DropBoxModal({ targetUsername, defaultSenderName, onSendDrop, onClose }) {
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
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!selectedFiles.length) return;
    setSending(true);
    setError('');
    const finalSenderName = senderName.trim() || 'Visitor';
    try {
      localStorage.setItem(SENDER_NAME_KEY, finalSenderName);
    } catch { /* ignore */ }

    try {
      let count = 0;
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgressText(`Sending ${i + 1} of ${selectedFiles.length}: ${file.name}`);
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
          <span>📷 Scanned via QR Code / Google Lens</span>
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
              Files you drop will be delivered directly into <b>@{targetUsername}’s WhatsApp Senders Hub</b>.
            </p>

            {completed ? (
              /* Success confirmation state */
              <div className="drop-success">
                <div className="success-icon">✓</div>
                <h3>Delivered to @{targetUsername}!</h3>
                <p className="fine">
                  <b>{sentCount} file{sentCount > 1 ? 's' : ''}</b> securely transferred. @{targetUsername} has
                  been notified and can preview or download them in their WhatsApp Hub.
                </p>
                <div className="btn-group" style={{ width: '100%' }}>
                  <button
                    className="btn btn-pill"
                    onClick={() => {
                      setCompleted(false);
                      setProgressPercent(0);
                    }}
                  >
                    Send More Files
                  </button>
                  <button className="btn btn-primary" onClick={onClose}>
                    Done
                  </button>
                </div>
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
                    placeholder="e.g. Rahul Sharma (optional)"
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
                    <span className="sub">Use camera</span>
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
                      ? `${selectedFiles.length} file(s) ready to send`
                      : 'Or tap here to browse documents & photos'}
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
                  disabled={sending || selectedFiles.length === 0}
                  whileTap={{ scale: 0.97 }}
                >
                  {sending ? 'Sending Files…' : `Send ${selectedFiles.length || ''} File(s) to @${targetUsername}`}
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
