import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT, formatSize, kindOf, validateFile } from '../utils/files';
import Avatar from './Avatar';
import { CloseIcon, FileIcon, UploadIcon } from './Icons';

export default function DropBoxModal({ targetUsername, defaultSenderName, onSendDrop, dropItems, onClose }) {
  const [targetInfo, setTargetInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [senderName, setSenderName] = useState(defaultSenderName || '');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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
        setError('Could not reach server.');
      } finally {
        setLoading(false);
      }
    }
    loadInfo();
  }, [targetUsername]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      const prob = validateFile(f);
      if (prob) {
        setError(`${f.name}: ${prob}`);
        return;
      }
    }
    setError('');
    setSelectedFiles(files);
  };

  const handleSend = async () => {
    if (!selectedFiles.length) return;
    setSending(true);
    setError('');

    try {
      for (const file of selectedFiles) {
        const res = await onSendDrop(targetUsername, file, senderName.trim() || 'Anonymous');
        if (!res.ok) {
          setError(res.error || 'Could not send file.');
          setSending(false);
          return;
        }
      }
      setCompleted(true);
      setSelectedFiles([]);
    } catch {
      setError('An error occurred during upload.');
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet drop-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Drop-box Delivery"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><CloseIcon /></button>

        {loading ? (
          <div className="drop-loading"><p>Connecting to @{targetUsername}…</p></div>
        ) : error && !targetInfo ? (
          <div className="drop-error">
            <h2>User Not Found</h2>
            <p className="lede">{error}</p>
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="drop-target-header">
              <Avatar name={targetInfo?.displayName || targetUsername} size={54} />
              <div className="drop-target-info">
                <h3>{targetInfo?.displayName || targetUsername}</h3>
                <span className="username-tag">@{targetUsername}</span>
                <span className={`status-badge ${targetInfo?.isOnline ? 'online' : 'dropbox'}`}>
                  {targetInfo?.isOnline ? '● Online' : '📦 24/7 Drop-box Active'}
                </span>
              </div>
            </div>

            <p className="lede text-center">
              {targetInfo?.isOnline
                ? 'Ready to receive files in real-time.'
                : 'Recipient is offline. Your files will be saved in their Drop-box for 10 minutes.'}
            </p>

            {completed ? (
              <div className="drop-success">
                <div className="success-icon">✓</div>
                <h3>Delivered to @{targetUsername}!</h3>
                <p className="fine">
                  The files have been securely dropped. They can preview or download them on Documay for the next 10 minutes.
                </p>
                <div className="btn-group">
                  <button className="btn btn-pill" onClick={() => setCompleted(false)}>Send More Files</button>
                  <button className="btn btn-primary" onClick={onClose}>Done</button>
                </div>
              </div>
            ) : (
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

                <div
                  className="drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <UploadIcon width={36} height={36} />
                  <b>{selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'Select photos or documents to drop'}</b>
                  <span className="fine">PNG, JPG, PDF, Word, Excel, PowerPoint (up to 100 MB)</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept={ACCEPT}
                    multiple
                    style={{ display: 'none' }}
                  />
                </div>

                {selectedFiles.length > 0 && (
                  <div className="selected-list">
                    {selectedFiles.map((f, i) => (
                      <div key={i} className="selected-item">
                        <FileIcon kind={kindOf(f.name)} size={20} />
                        <span className="selected-name">{f.name}</span>
                        <span className="selected-size">{formatSize(f.size)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <motion.button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={sending || selectedFiles.length === 0}
                  whileTap={{ scale: 0.97 }}
                >
                  {sending ? 'Dropping Files…' : `Drop ${selectedFiles.length || ''} File(s) Now`}
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
