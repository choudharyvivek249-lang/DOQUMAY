const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const make = (d) => (props) => <svg {...base} {...props}>{d}</svg>;

export const ScanIcon = make(<><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" /><path d="M7 12h10" /></>);
export const QrIcon = make(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2M14 20h2M20 14v1" /></>);
export const ClipIcon = make(<path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7" />);
export const BackIcon = make(<path d="M15 5l-7 7 7 7" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const DownloadIcon = make(<path d="M12 4v11M7 11l5 5 5-5M5 20h14" />);
export const UploadIcon = make(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>);
export const RefreshIcon = make(<path d="M20 11a8 8 0 10-2.3 6M20 4v7h-7" />);
export const CopyIcon = make(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></>);

export function FileIcon({ kind = 'file', size = 24 }) {
  return (
    <span className={`chip k-${kind}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }} aria-hidden="true">
      {kind.slice(0, 3).toUpperCase()}
    </span>
  );
}

export function Logo({ size = 56 }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size * 0.56} height={size * 0.56}><path d="M9 6h9l5 5v15H9z" fill="#fff" /><path d="M18 6v5h5" fill="#e7c4d4" /><path d="M12.5 17h7M12.5 21h5" stroke="#6d7e68" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </span>
  );
}
