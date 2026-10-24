import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import IncomingModal from './components/IncomingModal';
import QRModal from './components/QRModal';
import QRScanner from './components/QRScanner';
import TransferRoom from './components/TransferRoom';
import WelcomeScreen from './components/WelcomeScreen';
import { useDocumay } from './hooks/useDocumay';

const NAME_KEY = 'documay:name';

export default function App() {
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) || ''); // session only, never persisted
  const [overlay, setOverlay] = useState(null); // 'qr' | 'scan' | null
  const [toast, setToast] = useState(null);
  const notify = useCallback((msg) => setToast({ id: Date.now(), msg }), []);
  const dm = useDocumay(name, notify);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Someone scanned the QR with their phone's normal camera → /?join=TOKEN → pair automatically after the name step.
  const pendingJoin = useRef(new URLSearchParams(window.location.search).get('join'));
  useEffect(() => {
    if (!dm.connected || !pendingJoin.current) return;
    const token = pendingJoin.current;
    pendingJoin.current = null;
    window.history.replaceState({}, '', window.location.pathname);
    dm.scan(token).then((r) => { if (!r.ok) notify(r.error); });
  }, [dm.connected]);

  useEffect(() => { if (dm.room) setOverlay(null); }, [dm.room?.id]);

  const start = (n) => { sessionStorage.setItem(NAME_KEY, n); setName(n); };
  const changeName = () => { sessionStorage.removeItem(NAME_KEY); setName(''); setOverlay(null); };

  const waiting = dm.room ? dm.items.filter((i) => i.dir === 'in' && i.status === 'offered') : [];

  return (
    <>
      <AnimatePresence mode="wait">
        {dm.room ? (
          <TransferRoom key="room" room={dm.room} items={dm.items} onBack={dm.leave} onSend={dm.sendFiles} onCancel={dm.cancel} />
        ) : name ? (
          <HomeScreen key="home" name={name} connected={dm.connected} onScan={() => setOverlay('scan')} onMyQr={() => setOverlay('qr')} onChangeName={changeName} />
        ) : (
          <WelcomeScreen key="welcome" onSubmit={start} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {overlay === 'qr' && <QRModal key="qr" qr={dm.qr} name={name} onRefresh={dm.createQr} onClose={() => setOverlay(null)} />}
        {overlay === 'scan' && <QRScanner key="scan" onResult={dm.scan} onClose={() => setOverlay(null)} />}
        {waiting[0] && <IncomingModal key={waiting[0].id} item={waiting[0]} extra={waiting.length - 1} onAccept={(id) => dm.respond(id, true)} onReject={(id) => dm.respond(id, false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="toast" role="status" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
