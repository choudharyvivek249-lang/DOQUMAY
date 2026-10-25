import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { formatCountdown, formatSize, formatTime, kindOf } from '../utils/files';
import { useCountdown } from '../utils/useTick';
import Avatar from './Avatar';
import {
  BackIcon,
  CheckDoubleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  QrIcon,
  ScanIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

/**
 * Single file bubble inside a sender's WhatsApp chat thread
 */
function FileMessageBubble({ drop, onDismiss, onPreviewImage }) {
  const left = useCountdown(drop.expiresAt);
  const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(drop.mime) ||
    ['png', 'jpg', 'jpeg', 'webp'].some((ext) => drop.name.toLowerCase().endsWith(ext));

  const downloadUrl = `/api/files/${encodeURIComponent(drop.id)}?key=${encodeURIComponent(drop.key)}`;
  const previewUrl = `${downloadUrl}&inline=1`;

  return (
    <div className="wa-bubble incoming">
      <div className="wa-bubble-content">
        {isImage && (
          <div className="wa-bubble-image-wrap" onClick={() => onPreviewImage(drop, previewUrl)}>
            <img
              src={previewUrl}
              alt={drop.name}
              className="wa-bubble-image"
              loading="lazy"
            />
            <div className="wa-image-overlay">
              <EyeIcon width={18} height={18} />
              <span>Preview</span>
            </div>
          </div>
        )}

        <div className="wa-bubble-file-info">
          <FileIcon kind={kindOf(drop.name)} size={32} />
          <div className="wa-bubble-file-text">
            <span className="wa-bubble-filename" title={drop.name}>
              {drop.name}
            </span>
            <div className="wa-bubble-meta">
              <span className="wa-size">{formatSize(drop.size)}</span>
              <span>·</span>
              <span className="wa-countdown">
                ⏳ Expires in <b>{formatCountdown(left)}</b>
              </span>
            </div>
          </div>
        </div>

        <div className="wa-bubble-actions">
          <a
            href={downloadUrl}
            className="wa-btn-download"
            target="_blank"
            rel="noopener noreferrer"
            download={drop.name}
          >
            <DownloadIcon width={15} height={15} /> Download
          </a>
          <button
            type="button"
            className="wa-btn-dismiss"
            onClick={() => onDismiss(drop.id)}
            title="Delete this file"
            aria-label="Delete file"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>

        <div className="wa-bubble-foot">
          <span className="wa-time">{formatTime(drop.ts)}</span>
          <span className="wa-ticks">
            <CheckDoubleIcon width={16} height={16} />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Full WhatsApp interface for permanent users to see multiple file senders
 */
export default function WhatsAppHub({
  account,
  connected,
  drops = [],
  onDismissDrop,
  onScan,
  onPermanentQr,
  onMyQr,
  onOpenDropModal,
  onLogout,
  onToggleClassic,
  notify,
}) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDrop, setPreviewDrop] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  // Group all drops by senderName (e.g. "Alice", "Bob", "John")
  const senderGroups = useMemo(() => {
    const map = new Map();
    for (const drop of drops) {
      const rawName = (drop.senderName || 'Anonymous').trim();
      const key = rawName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: rawName,
          drops: [],
          latestTs: 0,
          totalBytes: 0,
          minExpiresAt: Infinity,
        });
      }
      const group = map.get(key);
      group.drops.push(drop);
      if (drop.ts > group.latestTs) group.latestTs = drop.ts;
      group.totalBytes += drop.size || 0;
      if (drop.expiresAt && drop.expiresAt < group.minExpiresAt) {
        group.minExpiresAt = drop.expiresAt;
      }
    }

    // Sort drops inside each group by chronological order
    for (const group of map.values()) {
      group.drops.sort((a, b) => a.ts - b.ts);
    }

    // Sort senders list by latest activity descending
    return Array.from(map.values()).sort((a, b) => b.latestTs - a.latestTs);
  }, [drops]);

  // Filtered senders based on search query
  const filteredSenders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return senderGroups;
    return senderGroups.filter((g) => {
      const matchName = g.name.toLowerCase().includes(q);
      const matchFile = g.drops.some((d) => d.name.toLowerCase().includes(q));
      return matchName || matchFile;
    });
  }, [senderGroups, searchQuery]);

  // Active selected sender group
  const activeGroup = useMemo(() => {
    if (!selectedKey) return null;
    return senderGroups.find((g) => g.key === selectedKey) || null;
  }, [senderGroups, selectedKey]);

  // Download all files from the selected sender
  const handleDownloadAll = async (group) => {
    if (!group || !group.drops.length) return;
    notify(`Starting download for ${group.drops.length} files from ${group.name}…`);
    for (const drop of group.drops) {
      const url = `/api/files/${encodeURIComponent(drop.id)}?key=${encodeURIComponent(drop.key)}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = drop.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  // Dismiss all files from the selected sender
  const handleDismissAll = async (group) => {
    if (!group || !group.drops.length) return;
    const ok = window.confirm(`Remove all ${group.drops.length} files from ${group.name}?`);
    if (!ok) return;
    for (const drop of group.drops) {
      await onDismissDrop(drop.id);
    }
    notify(`Dismissed all files from ${group.name}.`);
    if (selectedKey === group.key) {
      setSelectedKey(null);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?to=${account.username}`;
    navigator.clipboard.writeText(link);
    notify(`Copied personal Drop-box link: @${account.username}`);
  };

  return (
    <div className={`wa-container ${activeGroup ? 'wa-has-active-chat' : 'wa-no-active-chat'}`}>
      {/* ================= LEFT SIDEBAR (CHATS / SENDER LIST) ================= */}
      <aside className="wa-sidebar">
        {/* User Profile Drawer (WhatsApp Web style slide-over) */}
        <AnimatePresence>
          {showProfile && (
            <motion.div
              className="wa-profile-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              <header className="wa-profile-header">
                <button
                  type="button"
                  className="wa-profile-back-btn"
                  onClick={() => setShowProfile(false)}
                  aria-label="Back to chats"
                >
                  <BackIcon width={22} height={22} />
                </button>
                <h3>Profile</h3>
              </header>

              <div className="wa-profile-body">
                {/* Large Profile Avatar */}
                <div className="wa-profile-avatar-wrap">
                  <Avatar name={account.displayName || account.username} size={110} />
                </div>

                {/* Display Name Section */}
                <div className="wa-profile-section">
                  <span className="wa-profile-label">Your Name</span>
                  <b className="wa-profile-val">{account.displayName || account.username}</b>
                  <span className="wa-profile-caption">
                    This is your public display name shown to file senders.
                  </span>
                </div>

                {/* Username Section */}
                <div className="wa-profile-section">
                  <span className="wa-profile-label">Username</span>
                  <b className="wa-profile-val">@{account.username}</b>
                  <span className="wa-profile-status-badge">
                    <span className={`wa-status-dot ${connected ? 'online' : ''}`} />
                    {connected ? 'Active & Receiving Files 24/7' : 'Connecting…'}
                  </span>
                </div>

                {/* Permanent Drop-box Link & Share (Moved here from the main sidebar!) */}
                <div className="wa-profile-section wa-profile-drop-section">
                  <div className="wa-share-badge">
                    <span className="wa-pulse-dot" /> Permanent Drop-box Active
                  </div>
                  <p className="wa-share-desc">
                    Anyone can scan your permanent QR code or visit your link to drop files directly into your WhatsApp Hub:
                  </p>

                  <div className="wa-share-pill" onClick={handleCopyLink} title="Click to copy link">
                    <code>{window.location.host}/?to={account.username}</code>
                    <button type="button" className="wa-share-copy-btn" aria-label="Copy link">
                      <CopyIcon width={15} height={15} />
                    </button>
                  </div>

                  <div className="wa-profile-actions">
                    <button
                      type="button"
                      className="wa-profile-btn primary"
                      onClick={() => {
                        setShowProfile(false);
                        onPermanentQr();
                      }}
                    >
                      <QrIcon width={16} height={16} /> Show QR Code
                    </button>
                    <button
                      type="button"
                      className="wa-profile-btn"
                      onClick={handleCopyLink}
                    >
                      <CopyIcon width={15} height={15} /> Copy Link
                    </button>
                  </div>
                </div>

                {/* Actions: View toggle & Logout */}
                <div className="wa-profile-section">
                  <div className="wa-profile-bottom-actions">
                    <button
                      type="button"
                      className="wa-profile-link-btn"
                      onClick={() => {
                        setShowProfile(false);
                        onToggleClassic();
                      }}
                    >
                      📱 Switch to Simple View
                    </button>
                    <button
                      type="button"
                      className="wa-profile-link-btn danger"
                      onClick={onLogout}
                    >
                      🚪 Log Out of @{account.username}
                    </button>
                  </div>
                  <p className="fine" style={{ marginTop: '12px' }}>
                    🔒 Files sent to your WhatsApp Hub auto-delete 10 minutes after delivery.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User profile & quick action bar */}
        <header className="wa-sidebar-header">
          <div
            className="wa-user-profile clickable"
            onClick={() => setShowProfile(true)}
            title="Click to view Profile & Permanent Drop-box Link"
            role="button"
            tabIndex={0}
          >
            <Avatar name={account.displayName || account.username} size={42} />
            <div className="wa-user-text">
              <span className="wa-user-name">{account.displayName || account.username}</span>
              <span className="wa-user-tag">
                <span className={`wa-status-dot ${connected ? 'online' : ''}`} />
                @{account.username}
              </span>
            </div>
          </div>

          <div className="wa-header-actions">
            <button
              type="button"
              className="wa-icon-action"
              onClick={onScan}
              disabled={!connected}
              title="Scan QR Code camera"
              aria-label="Scan QR Code"
            >
              <ScanIcon width={20} height={20} />
            </button>
            <button
              type="button"
              className="wa-icon-action highlight"
              onClick={onPermanentQr}
              disabled={!connected}
              title="My Permanent QR Code"
              aria-label="Permanent QR Code"
            >
              <QrIcon width={20} height={20} />
            </button>
            <button
              type="button"
              className="wa-icon-action"
              onClick={() => setShowProfile(true)}
              title="My Profile"
              aria-label="My Profile"
            >
              👤
            </button>
            <button
              type="button"
              className="wa-icon-action"
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
            >
              🚪
            </button>
          </div>
        </header>

        {/* Search Bar */}
        <div className="wa-search-bar">
          <div className="wa-search-input-wrap">
            <SearchIcon width={16} height={16} className="wa-search-icon" />
            <input
              type="text"
              placeholder="Search senders or files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="wa-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="wa-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <CloseIcon width={12} height={12} />
              </button>
            )}
          </div>
        </div>

        {/* Senders List (WhatsApp Chats) */}
        <div className="wa-chats-list">
          {senderGroups.length === 0 ? (
            <div className="wa-chats-empty">
              <div className="wa-empty-icon">📥</div>
              <h3>No Senders Yet</h3>
              <p>
                When someone scans your permanent QR code or opens your link, their files will appear
                here organized into sender conversations just like WhatsApp!
              </p>
              <div className="wa-empty-actions">
                <button type="button" className="wa-btn-primary" onClick={onPermanentQr}>
                  ✨ Show Permanent QR
                </button>
                <button type="button" className="wa-btn-ghost" onClick={handleCopyLink}>
                  Copy Link
                </button>
              </div>
            </div>
          ) : filteredSenders.length === 0 ? (
            <div className="wa-no-results">
              <p>No senders or files matching "{searchQuery}"</p>
              <button type="button" className="link" onClick={() => setSearchQuery('')}>
                Clear filter
              </button>
            </div>
          ) : (
            filteredSenders.map((group) => {
              const isSelected = activeGroup?.key === group.key;
              const lastDrop = group.drops[group.drops.length - 1];
              return (
                <div
                  key={group.key}
                  className={`wa-chat-item ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedKey(group.key)}
                >
                  <Avatar name={group.name} size={48} />
                  <div className="wa-chat-details">
                    <div className="wa-chat-top-line">
                      <b className="wa-chat-name">{group.name}</b>
                      <span className="wa-chat-time">{formatTime(group.latestTs)}</span>
                    </div>

                    <div className="wa-chat-sub-line">
                      <span className="wa-chat-preview" title={lastDrop?.name}>
                        📎 {lastDrop?.name || 'File received'}
                      </span>
                      <div className="wa-chat-badges">
                        <span className="wa-file-badge">{group.drops.length}</span>
                      </div>
                    </div>

                    <div className="wa-chat-meta-line">
                      <span className="wa-chat-size">{formatSize(group.totalBytes)}</span>
                      <span>·</span>
                      <span className="wa-chat-expires">
                        ⏳ auto-deletes in 10m
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ================= RIGHT MAIN AREA (CHAT VIEW / CONVERSATION) ================= */}
      <main className="wa-main">
        {activeGroup ? (
          <div className="wa-chat-view">
            {/* WhatsApp Chat Top Header */}
            <header className="wa-chat-header">
              <button
                type="button"
                className="wa-back-btn"
                onClick={() => setSelectedKey(null)}
                aria-label="Back to all senders"
              >
                <BackIcon width={20} height={20} />
              </button>

              <div className="wa-chat-header-profile">
                <Avatar name={activeGroup.name} size={42} />
                <div className="wa-chat-header-info">
                  <b className="wa-sender-title">{activeGroup.name}</b>
                  <span className="wa-sender-status">
                    ● {activeGroup.drops.length} file{activeGroup.drops.length > 1 ? 's' : ''} ·{' '}
                    {formatSize(activeGroup.totalBytes)} total
                  </span>
                </div>
              </div>

              <div className="wa-chat-header-actions">
                <button
                  type="button"
                  className="wa-btn-header-action"
                  onClick={() => handleDownloadAll(activeGroup)}
                  title="Download all files from this sender"
                >
                  <DownloadIcon width={16} height={16} />
                  <span className="btn-label">Download All</span>
                </button>
                <button
                  type="button"
                  className="wa-btn-header-action danger"
                  onClick={() => handleDismissAll(activeGroup)}
                  title="Delete all files from this sender"
                >
                  <TrashIcon width={16} height={16} />
                </button>
              </div>
            </header>

            {/* Chat Messages Body with WhatsApp Wallpaper */}
            <div className="wa-messages-area">
              <div className="wa-date-pill">TODAY</div>

              <div className="wa-encryption-notice">
                🔒 Files sent to your Permanent Drop-box are end-to-end streamed and automatically
                wiped from the server 10 minutes after upload.
              </div>

              <div className="wa-bubbles-list">
                {activeGroup.drops.map((drop) => (
                  <FileMessageBubble
                    key={drop.id}
                    drop={drop}
                    onDismiss={onDismissDrop}
                    onPreviewImage={(d) => setPreviewDrop(d)}
                  />
                ))}
              </div>
            </div>

            {/* WhatsApp Chat Bottom Toolbar */}
            <footer className="wa-chat-footer">
              <div className="wa-footer-left">
                <span className="wa-footer-info">
                  Receiving files from <b>{activeGroup.name}</b>
                </span>
              </div>
              <div className="wa-footer-actions">
                <button
                  type="button"
                  className="wa-footer-btn"
                  onClick={() => handleDownloadAll(activeGroup)}
                >
                  <DownloadIcon width={16} height={16} /> Save All
                </button>
                <button
                  type="button"
                  className="wa-footer-btn primary"
                  onClick={onPermanentQr}
                >
                  ✨ Share My QR
                </button>
              </div>
            </footer>
          </div>
        ) : (
          /* WhatsApp Web Default Empty / Welcome Placeholder */
          <div className="wa-chat-placeholder">
            <div className="wa-placeholder-content">
              <div className="wa-placeholder-graphic">
                <span className="wa-big-icon">💬</span>
                <span className="wa-sub-icon">⚡</span>
              </div>
              <h2>Documay Permanent Hub</h2>
              <p className="wa-placeholder-desc">
                View, manage, and download incoming files from multiple senders simultaneously with a
                WhatsApp-style conversation interface.
              </p>

              <div className="wa-placeholder-cards">
                <div className="wa-ph-card" onClick={onPermanentQr}>
                  <div className="wa-ph-icon">🔲</div>
                  <b>Permanent QR Code</b>
                  <span>Print or display on your desk or storefront for zero-login file drops.</span>
                </div>
                <div className="wa-ph-card" onClick={handleCopyLink}>
                  <div className="wa-ph-icon">🔗</div>
                  <b>Shareable Link</b>
                  <span>Copy your personalized link: <code>{(typeof window !== 'undefined' ? window.location.host : 'documay.com')}/?to={account.username}</code></span>
                </div>
                <div className="wa-ph-card" onClick={onScan}>
                  <div className="wa-ph-icon">📸</div>
                  <b>Live Scanner</b>
                  <span>Point camera at any QR code to connect and transfer in real-time.</span>
                </div>
              </div>

              <div className="wa-placeholder-footer">
                <span>🔒 End-to-end encrypted · Auto-deletes in 10 minutes</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Image Preview Lightbox Modal */}
      <AnimatePresence>
        {previewDrop && (
          <motion.div
            className="wa-lightbox-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewDrop(null)}
          >
            <motion.div
              className="wa-lightbox-card"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wa-lightbox-head">
                <div className="wa-lightbox-title">
                  <b>{previewDrop.name}</b>
                  <span>From {previewDrop.senderName} · {formatSize(previewDrop.size)}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn dark"
                  onClick={() => setPreviewDrop(null)}
                  aria-label="Close image preview"
                >
                  <CloseIcon width={18} height={18} />
                </button>
              </div>

              <div className="wa-lightbox-body">
                <img
                  src={`/api/files/${encodeURIComponent(previewDrop.id)}?key=${encodeURIComponent(previewDrop.key)}&inline=1`}
                  alt={previewDrop.name}
                  className="wa-lightbox-img"
                />
              </div>

              <div className="wa-lightbox-foot">
                <a
                  href={`/api/files/${encodeURIComponent(previewDrop.id)}?key=${encodeURIComponent(previewDrop.key)}`}
                  className="btn btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewDrop.name}
                >
                  <DownloadIcon width={16} height={16} /> Download High-Res
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
