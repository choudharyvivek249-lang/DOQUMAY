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
import { useDocumay } from './hooks/useDocumay';
import { parseScanTarget } from './utils/files';

const NAME_KEY = 'documay:name';
const ACCOUNT_KEY = 'documay:account';

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
    return sessionStorage.getItem(NAME_KEY) || '';
  });

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

  // URL routing for ?join=TOKEN and ?to=USERNAME / ?u=USERNAME
  const initialParams = useRef(new URLSearchParams(window.location.search));
  useEffect(() => {
    const to = initialParams.current.get('to') || initialParams.current.get('u');
    const join = initialParams.current.get('join');

    if (to) {
      setDropTarget(to.replace(/^@/, ''));
      setOverlay('drop');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (join && dm.connected) {
      initialParams.current = new URLSearchParams();
      window.history.replaceState({}, '', window.location.pathname);
      dm.scan(join).then((r) => {
        if (!r?.ok && r?.error) notify(r.error);
      });
    }
  }, [dm.connected]);

  useEffect(() => {
    if (dm.room) setOverlay(null);
  }, [dm.room?.id]);

  const handleStartGuest = (guestName) => {
    sessionStorage.setItem(NAME_KEY, guestName);
    setName(guestName);
  };

  const handleAuthSuccess = (user) => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
    setAccount(user);
    setName(user.displayName || user.username);
    notify(`Welcome, @${user.username}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem(ACCOUNT_KEY);
    sessionStorage.removeItem(NAME_KEY);
    setAccount(null);
    setName('');
    setOverlay(null);
    notify('Logged out successfully.');
  };

  const handleChangeName = () => {
    sessionStorage.removeItem(NAME_KEY);
    setName('');
    setOverlay(null);
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
        {dm.room ? (
          <TransferRoom
            key="room"
            room={dm.room}
            items={dm.items}
            onBack={dm.leave}
            onSend={dm.sendFiles}
            onCancel={dm.cancel}
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
