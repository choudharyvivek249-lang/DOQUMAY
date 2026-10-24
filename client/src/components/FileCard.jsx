import { motion } from 'framer-motion';
import { SERVER } from '../hooks/useDocumay';
import { extOf, formatCountdown, formatSize, formatTime, kindOf } from '../utils/files';
import { DownloadIcon } from './Icons';

export default function FileCard({ item, now, onCancel }) {
  const out = item.dir === 'out';
  const kind = kindOf(item.name);
  const pct = item.size ? Math.min(100, Math.round((item.received / item.size) * 100)) : 0;
  const left = item.expiresAt - now;
  const status = item.status === 'ready' && left <= 0 ? 'expired' : item.status;
  const url = item.key ? `${SERVER}/api/files/${item.id}?key=${item.key}` : null;
  const peer = out ? item.to : item.from;

  let body = null;
  if (status === 'offered') {
    body = out
      ? <div className="state"><span>Waiting for {peer} to accept…</span><button className="link" onClick={() => onCancel(item.id)}>Cancel</button></div>
      : <div className="state"><span>Waiting for your answer</span></div>;
  } else if (status === 'accepted' || status === 'uploading') {
    body = (
      <>
        <div className="state"><span>{out ? 'Sending file…' : 'Receiving file…'} {pct}%</span>{out && <button className="link" onClick={() => onCancel(item.id)}>Cancel</button>}</div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      </>
    );
  } else if (status === 'ready') {
    body = (
      <div className="state">
        <span className="ok">{out ? 'Delivered' : 'Received'}</span>
        <a className="save" href={url} download={item.name}><DownloadIcon width={18} height={18} /> Save</a>
      </div>
    );
  } else {
    const text = { rejected: out ? `${peer} declined this file` : 'You declined this file', cancelled: 'Transfer cancelled', failed: 'Transfer failed', expired: 'Deleted after 10 minutes' }[status];
    body = <div className="state"><span className="bad">{text}</span></div>;
  }

  const showThumb = kind === 'image' && url && status === 'ready';

  return (
    <motion.article className={`bubble ${out ? 'out' : 'in'}`} layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 24, stiffness: 320 }}>
      <div className="file-row">
        {showThumb
          ? <img className="thumb" src={`${url}&inline=1`} alt="" loading="lazy" />
          : <span className={`chip k-${kind}`} aria-hidden="true">{extOf(item.name).slice(0, 4)}</span>}
        <div className="file-info">
          <b className="fname">{item.name}</b>
          <span className="fmeta">{formatSize(item.size)}</span>
        </div>
      </div>
      <p className="route">{item.from} → {item.to}</p>
      {body}
      <div className="foot">
        <time>{formatTime(item.ts)}</time>
        {status === 'ready' && <span>Auto-deletes in {formatCountdown(left)}</span>}
      </div>
    </motion.article>
  );
}
