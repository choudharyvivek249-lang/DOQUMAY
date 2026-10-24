import { motion } from 'framer-motion';
import { formatSize } from '../utils/files';
import Avatar from './Avatar';

export default function IncomingModal({ item, extra, onAccept, onReject }) {
  return (
    <motion.div className="backdrop center-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="incoming-title"
        initial={{ scale: 0.88, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}>
        <Avatar name={item.from} size={56} />
        <p id="incoming-title" className="incoming-text">
          <b>{item.from}</b> is sending you a file: <b className="break">{item.name}</b> ({formatSize(item.size)})
        </p>
        {extra > 0 && <p className="fine">+{extra} more waiting</p>}
        <div className="modal-actions">
          <motion.button className="btn btn-reject" onClick={() => onReject(item.id)} whileTap={{ scale: 0.96 }}>Reject</motion.button>
          <motion.button className="btn btn-primary" onClick={() => onAccept(item.id)} whileTap={{ scale: 0.96 }} autoFocus>Accept</motion.button>
        </div>
      </motion.section>
    </motion.div>
  );
}
