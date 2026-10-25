import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './Icons';

const READER_ID = 'documay-reader';

function friendly(err) {
  const msg = String(err?.message || err);
  if (/permission|denied|notallowed/i.test(msg)) return 'Camera access is blocked. Allow the camera in your browser settings, or paste the link below.';
  if (/secure|https/i.test(msg)) return 'Browsers only allow the camera on https:// or localhost. Open the app over HTTPS, or paste the link below.';
  return 'We couldn’t start the camera. You can paste the link below instead.';
}

export default function QRScanner({ onResult, onClose }) {
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [cameraOk, setCameraOk] = useState(false);
  const [manual, setManual] = useState('');

  const handle = async (text) => {
    if (busy.current) return;
    busy.current = true;
    const res = await onResult(text);
    if (!res.ok) { setError(res.error); setTimeout(() => { busy.current = false; }, 1500); } // else: parent closes the scanner
  };

  useEffect(() => {
    let scanner;
    // html5-qrcode is big, so it is only downloaded when someone actually opens the scanner
    const starting = import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      scanner = new Html5Qrcode(READER_ID, { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
      return scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
        (text) => handle(text),
        () => {},
      );
    }).then(() => setCameraOk(true)).catch((e) => setError(friendly(e)));
    return () => { starting.then(() => scanner?.stop()).then(() => scanner?.clear()).catch(() => {}); };
  }, []);

  return (
    <motion.div className="scanner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Scan a QR code">
      <div className="scanner-top">
        <button className="icon-btn dark" onClick={onClose} aria-label="Close scanner"><CloseIcon /></button>
        <b>Scan a DoquMay QR</b>
      </div>
      <div className="viewfinder">
        <div id={READER_ID} />
        {!cameraOk && !error && <p className="cam-wait">Starting camera…</p>}
      </div>
      <div className="scanner-bottom">
        {error ? <p className="scan-error" role="alert">{error}</p> : <p className="lede light">Line the code up inside the frame.</p>}
        <form className="manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) handle(manual); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste the link / code" aria-label="Paste a link or code" />
          <button className="btn btn-primary" disabled={!manual.trim()}>Connect</button>
        </form>
      </div>
    </motion.div>
  );
}
