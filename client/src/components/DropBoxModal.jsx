import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT, cleanUsername, formatSize, kindOf, validateFile } from '../utils/files';
import Avatar from './Avatar';
import { CloseIcon, FileIcon, UploadIcon } from './Icons';
import WhatsAppHandoffModal from './WhatsAppHandoffModal';

const SENDER_NAME_KEY = 'documay:lastSenderName';

export default function DropBoxModal({
  targetUsername,
  defaultSenderName,
  account,
  onSendDrop,
  onOpenAuth,
  onClose,
  onComplete,
}) {
  const cleanTarget = cleanUsername(targetUsername);
  const [targetInfo, setTargetInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [senderName, setSenderName] = useState(() => {
    try {
      return defaultSenderName || account?.displayName || account?.username || sessionStorage.getItem(SENDER_NAME_KEY) || '';
    } catch {
      return defaultSenderName || account?.displayName || account?.username || '';
    }
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState('');

  // Modals inside DropBox
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [uploadedResults, setUploadedResults] = useState([]);
  const [isServiceUnavailable, setIsServiceUnavailable] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Fetch recipient's public profile info
  useEffect(() => {
    async function loadInfo() {
      if (!cleanTarget) {
        setError('Invalid recipient identifier.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(cleanTarget)}`);
        const data = await res.json().catch(() => ({}));
        if (data.ok && data.user) {
          setTargetInfo(data.user);
        } else {
          if (res.status === 503 || data.isDatabaseError) {
            setIsServiceUnavailable(true);
            setError(data.error || 'Database service is temporarily unavailable. Please try again shortly.');
          } else {
            setError(data.error || 'User not found.');
          }
        }
      } catch {
        setIsServiceUnavailable(true);
        setError('Could not reach the DoquMay server.');
      } finally {
        setLoading(false);
      }
    }
    loadInfo();
  }, [cleanTarget]);

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

  // Sender presses Send -> Direct send without PIN
  const handleInitiateSend = () => {
    if (!selectedFiles.length) return;
    setError('');

    // Sender name validation: required, trimmed, 1-24 characters
    const cleanSender = (senderName || '').trim();
    if (!cleanSender) {
      setError('Please enter your sender name (e.g. Rahul Sharma).');
      return;
    }
    if (cleanSender.length > 24) {
      setError('Sender name must be 24 characters or fewer.');
      return;
    }

    executeSend();
  };

  // Upload files directly
  const executeSend = async () => {
    setSending(true);
    setError('');
    const finalSenderName = senderName.trim() || account?.displayName || account?.username || 'Sender';
    try {
      sessionStorage.setItem(SENDER_NAME_KEY, finalSenderName);
    } catch {}

    const results = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgressText(`Securing & uploading ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        setProgressPercent(10);

        const res = await onSendDrop(
          cleanTarget,
          file,
          finalSenderName,
          (offset, total) => {
            const pct = Math.min(98, Math.round((offset / total) * 100));
            setProgressPercent(pct);
          }
        );

        if (!res.ok) {
          setError(res.error || `Failed to transfer ${file.name}`);
          setSending(false);
          return;
        }
        results.push({ id: res.id, name: file.name, size: file.size, key: res.key });
      }

      setProgressPercent(100);
      setUploadedResults(results);

      // Continue to WhatsApp sharing handoff!
      setShowHandoffModal(true);
    } catch {
      setError('An error occurred during transfer. Please check connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <>
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
          aria-label="Direct File Transfer"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="icon-btn close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>

          {/* QR Scan Badge */}
          <div className="google-lens-tag">
            <span>📷 Recipient's Permanent QR Code Standee</span>
          </div>

          {loading ? (
            <div className="drop-loading">
              <div className="wa-pulse-dot" style={{ width: 14, height: 14 }} />
              <p>Connecting to @{cleanTarget || targetUsername}…</p>
            </div>
          ) : error && !targetInfo ? (
            <div className="drop-error">
              <h2>{isServiceUnavailable ? 'Service Temporarily Unavailable' : 'User Not Found'}</h2>
              <p className="lede">{error}</p>
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Recipient Profile Header */}
              <div className="drop-target-header">
                <Avatar name={targetInfo?.displayName || cleanTarget} size={54} />
                <div className="drop-target-info">
                  <h3>{targetInfo?.displayName || cleanTarget}</h3>
                  <span className="username-tag">@{targetInfo?.username || cleanTarget}</span>
                  <span className={`status-badge ${targetInfo?.isOnline ? 'online' : 'dropbox'}`}>
                    {targetInfo?.isOnline ? '● Online in WhatsApp Hub' : '📦 24/7 Drop-box Active'}
                  </span>
                </div>
              </div>

              <p className="lede text-center">
                Select documents or photos, enter your sender name, and share directly via WhatsApp.
              </p>

              {/* Main Selection & Send View */}
              <div className="drop-form">
                {error && <div className="auth-error">{error}</div>}

                <label className="field sender-name-field">
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Your Sender Name <b style={{ color: '#ef4444' }}>*</b></span>
                    {!account && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 99 }}>Guest Mode</span>}
                  </span>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => {
                      setSenderName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="e.g. Rahul Sharma"
                    maxLength={24}
                    required
                  />
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: -4 }}>
                    Shown to @{targetInfo?.displayName || cleanTarget} when they receive your files.
                  </span>
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
                      ? `${selectedFiles.length} file(s) selected (${formatSize(totalBytes)})`
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

                {/* Sender Account Notice / Guest Notice */}
                {!account && (
                  <div className="wa-disclaimer-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                    <span className="wa-disclaimer-icon">⚡</span>
                    <p>
                      <b>Sending as Guest</b> · No account or login needed. Files will be delivered directly to @{targetInfo?.displayName || cleanTarget}.
                    </p>
                  </div>
                )}

                {/* Send Button */}
                <motion.button
                  className="btn btn-primary"
                  onClick={handleInitiateSend}
                  disabled={sending || selectedFiles.length === 0}
                  whileTap={{ scale: 0.97 }}
                >
                  {sending
                    ? 'Securing & Uploading…'
                    : selectedFiles.length === 0
                    ? 'Select Files to Send'
                    : `Send ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
                </motion.button>
              </div>
            </>
          )}
        </motion.section>
      </motion.div>

      {/* WhatsApp Sharing Handoff Modal */}
      <AnimatePresence>
        {showHandoffModal && (
          <WhatsAppHandoffModal
            recipient={cleanTarget}
            files={selectedFiles}
            fileResults={uploadedResults}
            onClose={() => {
              setShowHandoffModal(false);
              onComplete?.(senderName.trim() || 'Sender', cleanTarget);
            }}
            onOpenHub={() => {
              setShowHandoffModal(false);
              onComplete?.(senderName.trim() || 'Sender', cleanTarget);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
