import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from './components/AuthModal';
import DropBoxModal from './components/DropBoxModal';
import HomeScreen from './components/HomeScreen';
import InboxModal from './components/InboxModal';
import IncomingModal from './components/IncomingModal';
import PermanentQRModal from './components/PermanentQRModal';
import QRModal from './components/QRModal';
import QRScanner from './components/QRScanner';
import TransferRoom from './components/TransferRoom';
import WelcomeScreen from './components/WelcomeScreen';
import WhatsAppHub from './components/WhatsAppHub';
import { useDocumay } from './hooks/useDocumay';
import { parseScanTarget } from './utils/files';

const NAME_KEY = 'documay:name';
const ACCOUNT_KEY = 'documay:account';
const VIEW_MODE_KEY = 'documay:viewMode';

export default function App() {
  const [account, setAccount] = useState(() => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [name, setName] = useState(() => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (raw) return JSON.parse(raw).displayName || JSON.parse(raw).username;
    } catch { /* ignore */ }
    try {
      return sessionStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  });

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) || 'whatsapp';
    } catch {
      return 'whatsapp';
    }
  });

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'whatsapp' ? 'classic' : 'whatsapp';
      try {
        localStorage.setItem(VIEW_MODE_KEY, next);
      } catch {}
      return next;
    });
  };

  const [overlay, setOverlay] = useState(null); // 'qr' | 'permQr' | 'scan' | 'auth' | 'inbox' | 'drop' | null
  const [dropTarget, setDropTarget] = useState(null); // username when dropping files
  const [toast, setToast] = useState(null);
  const notify = useCallback((msg) => setToast({ id: Date.now(), msg }), []);

  const dm = useDocumay(name, notify, account);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // URL routing for Google Lens / camera QR scans: ?to=USER, ?u=USER, /to/USER, or /@USER
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let to = params.get('to') || params.get('u');
    if (!to) {
      const pathMatch = window.location.pathname.match(/^\/(?:to\/|u\/|@)([a-zA-Z0-9_-]+)/);
      if (pathMatch) to = pathMatch[1];
    }
    if (to) {
      const clean = to.replace(/^@/, '');
      setDropTarget(clean);

      // Auto-set guest identity if visitor has no name yet
      if (!name) {
        const guestDefault = 'Guest Sender';
        try { sessionStorage.setItem(NAME_KEY, guestDefault); } catch {}
        setName(guestDefault);
      }

      // Try real-time 4-digit PIN live pairing if server socket is connected
      if (dm.connected) {
        dm.scan(clean).then((res) => {
          if (res?.offline) {
            setOverlay('drop');
          } else if (res?.ok) {
            setOverlay(null);
            window.history.replaceState({}, '', window.location.pathname);
          } else {
            setOverlay('drop');
          }
        });
      } else {
        setOverlay('drop');
      }
    }
  }, [dm.connected]);

  // Temporary 1-to-1 QR token pairing: ?join=TOKEN
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    if (join && dm.connected) {
      window.history.replaceState({}, '', window.location.pathname);
      dm.scan(join).then((r) => {
        if (!r?.ok && r?.error) notify(r.error);
      });
    }
  }, [dm.connected]);

  useEffect(() => {
    if (dm.room) setOverlay(null);
  }, [dm.room?.id]);

  const handleStartGuest = (guestName, pin) => {
    try {
      sessionStorage.setItem(NAME_KEY, guestName);
      if (pin) {
        sessionStorage.setItem('documay:pin', pin);
        localStorage.setItem('documay:pin', pin);
      }
    } catch {}
    setName(guestName);
    setViewMode('whatsapp');
    try { localStorage.setItem(VIEW_MODE_KEY, 'whatsapp'); } catch {}
    notify(`Welcome to DoquMay, ${guestName}! Device secured.`);
  };

  const handleAuthSuccess = (user) => {
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
      if (user.pin) {
        localStorage.setItem('documay:pin', user.pin);
        sessionStorage.setItem('documay:pin', user.pin);
      }
    } catch {}
    setAccount(user);
    setName(user.displayName || user.username);
    setViewMode('whatsapp');
    try { localStorage.setItem(VIEW_MODE_KEY, 'whatsapp'); } catch {}
    notify(`Welcome, @${user.username}!`);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(ACCOUNT_KEY);
      sessionStorage.removeItem(NAME_KEY);
      sessionStorage.removeItem('documay:pin');
    } catch {}
    setAccount(null);
    setName('');
    setOverlay(null);
    notify('Logged out successfully.');
  };

  const handleChangeName = () => {
    try {
      sessionStorage.removeItem(NAME_KEY);
      sessionStorage.removeItem('documay:pin');
    } catch {}
    setName('');
    setOverlay(null);
  };

  const handleDropComplete = (senderName, targetUser) => {
    if (senderName) {
      try { sessionStorage.setItem(NAME_KEY, senderName); } catch {}
      setName(senderName);
    }
    setViewMode('whatsapp');
    try { localStorage.setItem(VIEW_MODE_KEY, 'whatsapp'); } catch {}
    setOverlay(null);
    setDropTarget(null);
    window.history.replaceState({}, '', window.location.pathname);
    notify(`Files delivered to @${targetUser}! Viewing in your WhatsApp Hub.`);
  };

  const handleScanResult = async (text) => {
    const target = parseScanTarget(text);
    if (!target) return { ok: false, error: 'Unrecognized QR code or link format.' };

    const res = await dm.scan(text);
    if (res?.offline && res?.user) {
      // Recipient is offline, open Drop-box modal
      setDropTarget(res.user.username);
      setOverlay('drop');
      return { ok: true };
    }
    return res;
  };

  const waiting = dm.room ? dm.items.filter((i) => i.dir === 'in' && i.status === 'offered') : [];

  return (
    <>
      <AnimatePresence mode="wait">
        {dm.room && viewMode !== 'whatsapp' ? (
          <TransferRoom
            key="room"
            room={dm.room}
            items={dm.items}
            onBack={dm.leave}
            onSend={dm.sendFiles}
            onCancel={dm.cancel}
            onVerifyPin={dm.verifyPin}
            onAuthorizeHost={dm.authorizeHost}
            onOpenWhatsApp={() => {
              setViewMode('whatsapp');
              try { localStorage.setItem(VIEW_MODE_KEY, 'whatsapp'); } catch {}
            }}
          />
        ) : name && viewMode === 'whatsapp' ? (
          <WhatsAppHub
            key="whatsapp"
            account={account}
            guestName={!account ? name : null}
            connected={dm.connected}
            drops={dm.drops}
            dropItems={dm.dropItems}
            room={dm.room}
            roomItems={dm.items}
            onSendRoomFiles={dm.sendFiles}
            onVerifyPin={dm.verifyPin}
            onAuthorizeHost={dm.authorizeHost}
            onLeaveRoom={dm.leave}
            onDismissDrop={dm.dismissDrop}
            onScan={() => setOverlay('scan')}
            onPermanentQr={() => {
              if (account) setOverlay('permQr');
              else setOverlay('auth');
            }}
            onMyQr={() => setOverlay('qr')}
            onOpenDropModal={(target) => {
              setDropTarget(target);
              setOverlay('drop');
            }}
            onAuth={() => setOverlay('auth')}
            onChangeName={handleChangeName}
            onLogout={handleLogout}
            onToggleClassic={toggleViewMode}
            notify={notify}
          />
        ) : name ? (
          <HomeScreen
            key="home"
            name={name}
            account={account}
            connected={dm.connected}
            dropsCount={dm.drops.length}
            onScan={() => setOverlay('scan')}
            onMyQr={() => setOverlay('qr')}
            onPermanentQr={() => setOverlay('permQr')}
            onOpenInbox={() => setOverlay('inbox')}
            onOpenWhatsAppHub={() => {
              setViewMode('whatsapp');
              try { localStorage.setItem(VIEW_MODE_KEY, 'whatsapp'); } catch {}
            }}
            onAuth={() => setOverlay('auth')}
            onLogout={handleLogout}
            onChangeName={handleChangeName}
          />
        ) : (
          <WelcomeScreen
            key="welcome"
            onSubmit={handleStartGuest}
            onOpenAuth={() => setOverlay('auth')}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {overlay === 'qr' && (
          <QRModal
            key="qr"
            qr={dm.qr}
            name={name}
            onRefresh={dm.createQr}
            onClose={() => setOverlay(null)}
          />
        )}

        {overlay === 'permQr' && account && (
          <PermanentQRModal
            key="permQr"
            account={account}
            onClose={() => setOverlay(null)}
          />
        )}

        {overlay === 'scan' && (
          <QRScanner
            key="scan"
            onResult={handleScanResult}
            onClose={() => setOverlay(null)}
          />
        )}

        {overlay === 'auth' && (
          <AuthModal
            key="auth"
            onClose={() => setOverlay(null)}
            onSuccess={handleAuthSuccess}
          />
        )}

        {overlay === 'inbox' && (
          <InboxModal
            key="inbox"
            drops={dm.drops}
            onDismiss={dm.dismissDrop}
            onClose={() => setOverlay(null)}
          />
        )}

        {overlay === 'drop' && dropTarget && (
          <DropBoxModal
            key="drop"
            targetUsername={dropTarget}
            defaultSenderName={name}
            onSendDrop={dm.sendDrop}
            dropItems={dm.dropItems}
            onClose={() => { setOverlay(null); setDropTarget(null); }}
            onComplete={handleDropComplete}
          />
        )}

        {waiting[0] && (
          <IncomingModal
            key={waiting[0].id}
            item={waiting[0]}
            extra={waiting.length - 1}
            onAccept={(id) => dm.respond(id, true)}
            onReject={(id) => dm.respond(id, false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
