import { motion } from 'framer-motion';
import { useState } from 'react';
import { Logo } from './Icons';

export default function WelcomeScreen({ onSubmit }) {
  const [value, setValue] = useState('');
  const clean = value.trim();
  const submit = (e) => { e.preventDefault(); if (clean) onSubmit(clean); };

  return (
    <motion.main className="screen center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form className="welcome" onSubmit={submit} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 220 }}>
        <Logo size={64} />
        <h1>Documay</h1>
        <p className="lede">Send photos and documents by scanning a QR code. No sign-up, nothing saved.</p>
        <label className="field">
          <span>Enter your display name to start</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={24} placeholder="e.g. Rahul Sharma" autoComplete="nickname" autoFocus />
        </label>
        <motion.button className="btn btn-primary" disabled={!clean} whileTap={{ scale: 0.97 }}>Get Started</motion.button>
        <p className="fine">Files are deleted automatically 10 minutes after they’re sent.</p>
      </motion.form>
    </motion.main>
  );
}
