import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPT, formatCountdown, formatSize, formatTime, kindOf } from '../utils/files';
import { useCountdown } from '../utils/useTick';
import Avatar from './Avatar';
import {
  BackIcon,
  CheckDoubleIcon,
  ClipIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  QrIcon,
  ScanIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from './Icons';

import SecurityPinHandshake from './SecurityPinHandshake';

/**
 * Single file bubble inside a sender's WhatsApp chat thread
 */
function FileMessageBubble({ drop, onDismiss, onPreviewImage }) {
  const left = useCountdown(drop.expiresAt);
  const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(drop.mime) ||
    ['png', 'jpg', 'jpeg', 'webp'].some((ext) => drop.name?.toLowerCase().endsWith(ext));

  const downloadUrl = drop.key
    ? `/api/files/${encodeURIComponent(drop.id)}?key=${encodeURIComponent(drop.key)}`
    : null;
  const previewUrl = downloadUrl ? `${downloadUrl}&inline=1` : null;
  const isOut = drop.dir === 'out';

  return (
    <div className={`wa-bubble ${isOut ? 'outgoing' : 'incoming'}`}>
      <div className="wa-bubble-content">
        {isImage && previewUrl && (
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
          {downloadUrl ? (
            <>
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
                className="wa-btn-download"
                style={{ background: '#25d366', color: '#ffffff', border: 'none' }}
                onClick={() => {
                  const fullUrl = `${window.location.origin}${downloadUrl}`;
                  const text = `📄 Sent via DoquMay: ${drop.name} (${formatSize(drop.size)})\n🔒 Temporary secure download (expires in 10 minutes):\n${fullUrl}\n⚡ Ephemeral & Secure Document Transfer`;
                  if (navigator.share) {
                    navigator.share({ title: drop.name, text }).catch(() => {});
                  } else {
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                  }
                }}
                title="Share link to WhatsApp"
              >
                💬 WhatsApp
              </button>
            </>
          ) : (
            <span className="wa-status-pill sent">✓ Delivered</span>
          )}
          {onDismiss && !isOut && (
            <button
              type="button"
              className="wa-btn-dismiss"
              onClick={() => onDismiss(drop.id)}
              title="Delete this file"
              aria-label="Delete file"
            >
              <TrashIcon width={14} height={14} />
            </button>
          )}
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
 * WhatsApp interface for both Permanent accounts and Guest accounts.
 * Note: Guest accounts DO NOT have a permanent QR code (only temporary 2-minute QR and option to claim standee).
 */
export default function WhatsAppHub({
  account,
  guestName,
  connected,
  drops = [],
  dropItems = [],
  room = null,
  roomItems = [],
  onSendRoomFiles,
  onVerifyPin,
  onAuthorizeHost,
  onLeaveRoom,
  onDismissDrop,
  onScan,
  onPermanentQr,
  onMyQr,
  onOpenDropModal,
  onAuth,
  onOpenPinChange,
  onChangeName,
  onLogout,
  onToggleClassic,
  notify,
}) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDrop, setPreviewDrop] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const roomFileInputRef = useRef(null);

  const isGuest = !account;
  const myDisplayName = account ? (account.displayName || account.username) : (guestName || 'Guest User');
  const myUsernameTag = account ? `@${account.username}` : 'Guest Mode';

  const handlePickRoomFiles = (e) => {
    if (e.target.files?.length) {
      onSendRoomFiles?.(e.target.files);
    }
    e.target.value = '';
  };

  // Group all drops (inbound), dropItems (outbound), and live room files by conversation partner
  const senderGroups = useMemo(() => {
    const map = new Map();

    // 1. Inbound received files
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
      group.drops.push({ ...drop, dir: 'in' });
      if (drop.ts > group.latestTs) group.latestTs = drop.ts;
      group.totalBytes += drop.size || 0;
      if (drop.expiresAt && drop.expiresAt < group.minExpiresAt) {
        group.minExpiresAt = drop.expiresAt;
      }
    }

    // 2. Outbound sent files
    for (const item of dropItems) {
      const rawName = (item.toUsername || 'Recipient').trim();
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
      group.drops.push({
        ...item,
        dir: 'out',
        senderName: 'You',
        expiresAt: item.expiresAt || (item.ts + 600000),
      });
      if (item.ts > group.latestTs) group.latestTs = item.ts;
      group.totalBytes += item.size || 0;
    }

    // 3. Live connected room peer & live transferred files
    if (room?.peer?.name) {
      const rawName = room.peer.name.trim();
      const key = rawName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: rawName,
          drops: [],
          latestTs: Date.now(),
          totalBytes: 0,
          minExpiresAt: Infinity,
          isLiveRoom: true,
          peerOnline: room.peerOnline,
          verified: room.verified,
        });
      }
      const group = map.get(key);
      group.isLiveRoom = true;
      group.peerOnline = room.peerOnline;
      group.verified = room.verified;
      for (const item of roomItems) {
        if (!group.drops.some((d) => d.id === item.id)) {
          group.drops.push({
            ...item,
            senderName: item.dir === 'out' ? 'You' : rawName,
            expiresAt: item.expiresAt || (Date.now() + 600000),
          });
          if ((item.ts || Date.now()) > group.latestTs) group.latestTs = item.ts || Date.now();
          group.totalBytes += item.size || 0;
        }
      }
    }

    // Sort drops inside each group by chronological order
    for (const group of map.values()) {
      group.drops.sort((a, b) => a.ts - b.ts);
    }

    // Sort senders list by latest activity descending (live room always at the top!)
    return Array.from(map.values()).sort((a, b) => {
      if (a.isLiveRoom && !b.isLiveRoom) return -1;
      if (!a.isLiveRoom && b.isLiveRoom) return 1;
      return b.latestTs - a.latestTs;
    });
  }, [drops, dropItems, room, roomItems]);

  // Auto-select live room conversation when room becomes active
  useEffect(() => {
    if (room?.peer?.name) {
      setSelectedKey(room.peer.name.toLowerCase());
    }
  }, [room?.id]);

  // Auto-select latest active conversation if none selected
  useEffect(() => {
    if (!selectedKey && senderGroups.length > 0) {
      setSelectedKey(senderGroups[0].key);
    }
  }, [senderGroups.length]);

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
    if (isGuest) {
      notify('Register a permanent account to get your personalized link & standee!');
      onAuth?.();
      return;
    }
    const link = `${window.location.origin}/receive/${account.username}`;
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
                  <Avatar name={myDisplayName} size={110} />
                </div>

                {/* Display Name Section */}
                <div className="wa-profile-section">
                  <span className="wa-profile-label">Your Name</span>
                  <b className="wa-profile-val">{myDisplayName}</b>
                  <span className="wa-profile-caption">
                    {isGuest
                      ? 'Temporary guest display name for this device session.'
                      : 'This is your public display name shown to file senders.'}
                  </span>
                </div>

                {/* Account / Username Section */}
                <div className="wa-profile-section">
                  <span className="wa-profile-label">Account Status</span>
                  <b className="wa-profile-val">{myUsernameTag}</b>
                  <span className={`wa-profile-status-badge ${isGuest ? 'guest' : ''}`}>
                    <span className={`wa-status-dot ${connected ? 'online' : ''}`} />
                    {connected
                      ? isGuest
                        ? 'Guest Session · Live & Ready'
                        : 'Permanent Account · Receiving 24/7'
                      : 'Connecting…'}
                  </span>
                </div>

                {/* Permanent vs Guest Action Card */}
                {!isGuest ? (
                  <div className="wa-profile-section wa-profile-drop-section">
                    <div className="wa-share-badge">
                      <span className="wa-pulse-dot" /> Permanent Drop-box Active
                    </div>
                    <p className="wa-share-desc">
                      Anyone can scan your permanent QR standee or visit your link to drop files directly into your WhatsApp Hub:
                    </p>

                    <div className="wa-share-pill" onClick={handleCopyLink} title="Click to copy link">
                      <code>{window.location.host}/receive/{account.username}</code>
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
                          onPermanentQr?.();
                        }}
                      >
                        <QrIcon width={16} height={16} /> Show Standee QR
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
                ) : (
                  <div className="wa-profile-section wa-profile-drop-section wa-guest-promo-box">
                    <div className="wa-share-badge promo">
                      <span className="wa-pulse-dot" /> Guest Session (No Permanent QR)
                    </div>
                    <p className="wa-share-desc">
                      Guest accounts don't have a permanent QR code. You can use 2-minute temporary QR codes or claim your free permanent standee:
                    </p>

                    <div className="wa-guest-action-card">
                      <div className="wa-guest-promo-head">
                        <span className="wa-sparkle-icon">✨</span>
                        <div>
                          <b>Claim Permanent Desk Standee</b>
                          <p>Get a permanent anime QR standee, custom @handle, and permanent WhatsApp inbox!</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="wa-profile-btn primary"
                        onClick={() => {
                          setShowProfile(false);
                          onAuth?.();
                        }}
                      >
                        ✨ Get Permanent Standee
                      </button>
                    </div>

                    <div className="wa-profile-actions" style={{ marginTop: '12px' }}>
                      <button
                        type="button"
                        className="wa-profile-btn"
                        onClick={() => {
                          setShowProfile(false);
                          onMyQr?.();
                        }}
                      >
                        <QrIcon width={16} height={16} /> Temporary 2m QR
                      </button>
                      <button
                        type="button"
                        className="wa-profile-btn"
                        onClick={() => {
                          setShowProfile(false);
                          onScan?.();
                        }}
                      >
                        <ScanIcon width={16} height={16} /> Scan Camera
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions: View toggle & Logout/Exit */}
                <div className="wa-profile-section">
                  <div className="wa-profile-bottom-actions">
                    {account && onOpenPinChange && (
                      <button
                        type="button"
                        className="wa-profile-link-btn"
                        onClick={() => {
                          setShowProfile(false);
                          onOpenPinChange();
                        }}
                      >
                        🛡️ Change 4-Digit Send PIN
                      </button>
                    )}
                    <button
                      type="button"
                      className="wa-profile-link-btn"
                      onClick={() => {
                        setShowProfile(false);
                        onToggleClassic?.();
                      }}
                    >
                      📱 Switch to Simple View
                    </button>
                    {!isGuest ? (
                      <button
                        type="button"
                        className="wa-profile-link-btn danger"
                        onClick={onLogout}
                      >
                        🚪 Log Out of @{account.username}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="wa-profile-link-btn danger"
                        onClick={() => {
                          setShowProfile(false);
                          onChangeName?.();
                        }}
                      >
                        🚪 Exit Guest Session / Change Name
                      </button>
                    )}
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
            title="Click to view Profile"
            role="button"
            tabIndex={0}
          >
            <Avatar name={myDisplayName} size={42} />
            <div className="wa-user-text">
              <span className="wa-user-name">{myDisplayName}</span>
              <span className="wa-user-tag">
                <span className={`wa-status-dot ${connected ? 'online' : ''}`} />
                {myUsernameTag}
              </span>
            </div>
          </div>

          <div className="wa-header-actions">
            {/* Camera Scan QR */}
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

            {/* Permanent QR button ONLY for permanent accounts; Temporary QR for guests */}
            {!isGuest ? (
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
            ) : (
              <button
                type="button"
                className="wa-icon-action highlight"
                onClick={onMyQr}
                disabled={!connected}
                title="Temporary 2-min QR Code"
                aria-label="Temporary QR Code"
              >
                <QrIcon width={20} height={20} />
              </button>
            )}

            {/* Claim standee button for guests */}
            {isGuest && (
              <button
                type="button"
                className="wa-icon-action promo-star"
                onClick={onAuth}
                title="Get Permanent Standee"
                aria-label="Get Permanent Standee"
              >
                ✨
              </button>
            )}

            {/* Profile Drawer */}
            <button
              type="button"
              className="wa-icon-action"
              onClick={() => setShowProfile(true)}
              title="My Profile"
              aria-label="My Profile"
            >
              👤
            </button>

            {/* Exit/Logout */}
            <button
              type="button"
              className="wa-icon-action"
              onClick={!isGuest ? onLogout : onChangeName}
              title={!isGuest ? 'Log out' : 'Exit Guest Session'}
              aria-label={!isGuest ? 'Log out' : 'Exit Guest Session'}
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
              <h3>No Transfers Yet</h3>
              <p>
                {!isGuest
                  ? 'When someone scans your permanent QR code or opens your link, their files will appear here organized into sender conversations!'
                  : 'When someone shares documents with you via QR code or live transfer, they will appear here organized into conversations!'}
              </p>
              <div className="wa-empty-actions">
                {!isGuest ? (
                  <>
                    <button type="button" className="wa-btn-primary" onClick={onPermanentQr}>
                      ✨ Show Standee QR
                    </button>
                    <button type="button" className="wa-btn-ghost" onClick={handleCopyLink}>
                      Copy Link
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="wa-btn-primary" onClick={onMyQr}>
                      ⚡ Share Temporary QR
                    </button>
                    <button type="button" className="wa-btn-ghost" onClick={onScan}>
                      📸 Scan QR
                    </button>
                    <button type="button" className="wa-btn-ghost highlight" onClick={onAuth}>
                      ✨ Get Permanent Standee
                    </button>
                  </>
                )}
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
                    {formatSize(activeGroup.totalBytes)} total · ↔ Bidirectional
                  </span>
                </div>
              </div>

              <div className="wa-chat-header-actions">
                <button
                  type="button"
                  className="wa-btn-header-action reply-action"
                  onClick={() => onOpenDropModal?.(activeGroup.name)}
                  title={`Send files to ${activeGroup.name}`}
                >
                  <span>📤 Send Files</span>
                </button>
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

            {/* Live Room Security PIN Handshake Overlay */}
            <AnimatePresence>
              {activeGroup.isLiveRoom && room && !room.verified && (
                <SecurityPinHandshake
                  room={room}
                  onVerifyPin={onVerifyPin}
                  onAuthorizeHost={onAuthorizeHost}
                  onCancel={() => { onLeaveRoom?.(); setSelectedKey(null); }}
                />
              )}
            </AnimatePresence>

            {/* Chat Messages Body with WhatsApp Wallpaper */}
            <div className="wa-messages-area">
              <div className="wa-date-pill">TODAY</div>

              <div className="wa-encryption-notice">
                🔒 Protected by 4-digit security &amp; end-to-end streaming. Files auto-delete from the server 10 minutes after upload.
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
            <footer className="wa-chat-footer" role="region" aria-label="Transfer Room Actions">
              {/* Compact Informational Status Row */}
              <div className="wa-footer-status-row">
                <div className="wa-footer-status-pill">
                  <span
                    className={`wa-footer-status-dot ${
                      activeGroup.isLiveRoom ? (room?.peerOnline ? 'live' : 'offline') : 'active'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="wa-footer-status-text">
                    Sharing documents with <b className="wa-footer-recipient">{activeGroup.name}</b>
                  </span>
                  {activeGroup.isLiveRoom && (
                    <span className={`wa-footer-live-badge ${room?.peerOnline ? 'live' : 'offline'}`}>
                      {room?.peerOnline ? '● Live' : '○ Offline'}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons Toolbar / Grid */}
              <div className="wa-footer-actions">
                {/* 1. Send Files Back (Primary Action on mobile) */}
                {activeGroup.isLiveRoom ? (
                  <>
                    <input ref={roomFileInputRef} type="file" accept={ACCEPT} multiple hidden onChange={handlePickRoomFiles} />
                    <button
                      type="button"
                      className="wa-footer-btn wa-btn-reply"
                      onClick={() => roomFileInputRef.current?.click()}
                      title={`Send files directly to ${activeGroup.name}`}
                      disabled={!room?.peerOnline || !room?.verified}
                      aria-label={`Send files directly to ${activeGroup.name}`}
                    >
                      <ClipIcon className="wa-btn-icon" width={18} height={18} />
                      <span className="wa-btn-label">Send Files Back</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="wa-footer-btn wa-btn-reply"
                    onClick={() => onOpenDropModal?.(activeGroup.name)}
                    title={`Send files back to ${activeGroup.name}`}
                    aria-label={`Send files back to ${activeGroup.name}`}
                  >
                    <UploadIcon className="wa-btn-icon" width={18} height={18} />
                    <span className="wa-btn-label">Send Files Back</span>
                  </button>
                )}

                {/* 2. Save All */}
                <button
                  type="button"
                  className="wa-footer-btn wa-btn-save-all"
                  onClick={() => handleDownloadAll(activeGroup)}
                  title={`Save all ${activeGroup.drops.length} files to device`}
                  aria-label={`Save all ${activeGroup.drops.length} files to device`}
                >
                  <DownloadIcon className="wa-btn-icon" width={18} height={18} />
                  <span className="wa-btn-label">Save All</span>
                </button>

                {/* 3. Standee QR / Share QR */}
                {!isGuest ? (
                  <button
                    type="button"
                    className="wa-footer-btn wa-btn-qr"
                    onClick={onPermanentQr}
                    title="View Standee QR Code"
                    aria-label="View Standee QR Code"
                  >
                    <QrIcon className="wa-btn-icon" width={18} height={18} />
                    <span className="wa-btn-label">Standee QR</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="wa-footer-btn wa-btn-qr"
                    onClick={onMyQr}
                    title="Share 2-Minute QR Code"
                    aria-label="Share 2-Minute QR Code"
                  >
                    <QrIcon className="wa-btn-icon" width={18} height={18} />
                    <span className="wa-btn-label">Share 2m QR</span>
                  </button>
                )}
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
              <h2>DoquMay {!isGuest ? 'Permanent Hub' : 'Guest Hub'}</h2>
              <p className="wa-placeholder-desc">
                {!isGuest
                  ? 'Manage and download incoming files from multiple senders with a WhatsApp-style conversation interface.'
                  : 'Transfer files bidirectionally with zero login required. You can send and receive files with both permanent and guest users.'}
              </p>

              <div className="wa-placeholder-cards">
                {!isGuest ? (
                  <>
                    <div className="wa-ph-card" onClick={onPermanentQr}>
                      <div className="wa-ph-icon">🔲</div>
                      <b>Permanent Standee QR</b>
                      <span>Print or display on your desk or shop for zero-login file drops.</span>
                    </div>
                    <div className="wa-ph-card" onClick={handleCopyLink}>
                      <div className="wa-ph-icon">🔗</div>
                      <b>Shareable Link</b>
                      <span>Copy your personalized link: <code>{window.location.host}/receive/{account?.username}</code></span>
                    </div>

                    <div className="wa-ph-card" onClick={onScan}>
                      <div className="wa-ph-icon">📸</div>
                      <b>Live Camera Scanner</b>
                      <span>Point camera at any QR code to connect and transfer with 4-digit PIN safety.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="wa-ph-card" onClick={onMyQr}>
                      <div className="wa-ph-icon">⚡</div>
                      <b>Temporary 2-min QR</b>
                      <span>Generate a fast one-time QR code to pair with any nearby phone or laptop.</span>
                    </div>
                    <div className="wa-ph-card" onClick={onScan}>
                      <div className="wa-ph-icon">📸</div>
                      <b>Live Camera Scanner</b>
                      <span>Point camera at any QR code or standee to connect and transfer files.</span>
                    </div>
                    <div className="wa-ph-card promo" onClick={onAuth}>
                      <div className="wa-ph-icon">✨</div>
                      <b>Get Permanent Standee</b>
                      <span>Register a free account to get an artistic desk QR standee and custom link.</span>
                    </div>
                  </>
                )}
              </div>

              <div className="wa-placeholder-footer">
                <span>🛡️ 4-digit PIN security · End-to-end encrypted · Auto-deletes in 10 minutes</span>
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
