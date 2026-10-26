import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT, cleanUsername, formatSize, kindOf, validateFile } from '../utils/files';
import Avatar from './Avatar';
import { CloseIcon, FileIcon, UploadIcon } from './Icons';
import SendPinModal from './SendPinModal';
import WhatsAppHandoffModal from './WhatsAppHandoffModal';

const SENDER_NAME_KEY = 'documay:lastSenderName';

export default function DropBoxModal({
  targetUsername,
  defaultSenderName,
  account,
  onSendDrop,
  onVerifySendPin,
  onOpenAuth,
  onClose,
  onComplete,
}) {
  const cleanTarget = cleanUsername(targetUsername);
  const [targetInfo, setTargetInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [senderName, setSenderName] = useState(() => {
    return defaultSenderName || account?.displayName || account?.username || localStorage.getItem(SENDER_NAME_KEY) || '';
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState('');

  // Modals inside DropBox
  const [showPinModal, setShowPinModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [uploadedResults, setUploadedResults] = useState([]);

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
        const data = await res.json();
        if (data.ok && data.user) {
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

  // Step 4: Sender presses Send -> Trigger PIN verification
  const handleInitiateSend = () => {
    if (!selectedFiles.length) return;
    setError('');

    // If user has not created an account or logged in yet, prompt them to set up account & PIN
    if (!account) {
      onOpenAuth?.();
      return;
    }

    // Display clean 4-digit PIN verification screen
    setShowPinModal(true);
  };

  // Step 6 & 7: Verify PIN on backend and obtain single-use send authorization token
  const handleVerifyPin = async (pinString) => {
    const batchId = `drop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const res = await onVerifySendPin(pinString, cleanTarget, selectedFiles.length, batchId);
    if (!res.ok) {
      return res; // returns error / lockout info to SendPinModal
    }

    // Authorized! Close PIN modal and start upload with sendAuthToken
    setShowPinModal(false);
    executeAuthorizedSend(res.sendAuthToken);
    return { ok: true };
  };

  // Step 8: Upload files with valid sendAuthToken
  const executeAuthorizedSend = async (sendAuthToken) => {
    setSending(true);
    setError('');
    const finalSenderName = senderName.trim() || account?.displayName || account?.username || 'Sender';
    try {
      localStorage.setItem(SENDER_NAME_KEY, finalSenderName);
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
          },
          sendAuthToken
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

      // Step 9: Continue to WhatsApp sharing handoff!
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
              <h2>User Not Found</h2>
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
                Select documents or photos, verify your <b>4-digit Send PIN</b>, and share via WhatsApp.
              </p>

              {/* Main Selection & Send View */}
              <div className="drop-form">
                {error && <div className="auth-error">{error}</div>}

                <label className="field">
                  <span>Your Sender Name</span>
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

                {/* Sender Account Notice */}
                {!account && selectedFiles.length > 0 && (
                  <div className="wa-disclaimer-box" style={{ background: '#f5f3ff', borderColor: '#c4b5fd' }}>
                    <span className="wa-disclaimer-icon">🛡️</span>
                    <p>
                      A <b>4-digit Send PIN</b> is required to authorize file transfers. You can set up your free account in 10 seconds.
                    </p>
                  </div>
                )}

                {/* Send Button -> Opens 4-digit PIN Verification */}
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
                    : !account
                    ? 'Set Up PIN & Send'
                    : `Enter PIN & Send ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
                </motion.button>
              </div>
            </>
          )}
        </motion.section>
      </motion.div>

      {/* 4-Digit Send PIN Verification Screen Modal */}
      <AnimatePresence>
        {showPinModal && (
          <SendPinModal
            recipient={cleanTarget}
            filesCount={selectedFiles.length}
            totalSize={totalBytes}
            onVerify={handleVerifyPin}
            onForgotPin={() => {
              setShowPinModal(false);
              onOpenAuth?.();
            }}
            onClose={() => setShowPinModal(false)}
          />
        )}
      </AnimatePresence>

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

