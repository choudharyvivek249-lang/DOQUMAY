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
export const SearchIcon = make(<><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>);
export const CheckDoubleIcon = make(<><path d="M18 6L7 17l-5-5" /><path d="M22 10l-7.5 7.5L13 16" /></>);
export const TrashIcon = make(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>);
export const EyeIcon = make(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>);
export const ChatIcon = make(<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />);
export const ExternalLinkIcon = make(<><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>);

export function FileIcon({ kind = 'file', size = 24 }) {
  return (
    <span className={`chip k-${kind}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }} aria-hidden="true">
      {kind.slice(0, 3).toUpperCase()}
    </span>
  );
}

/**
 * DoquMay Brand Logo
 * Inspired by Google Pay, PhonePe, and Paytm:
 * - Rich royal purple & vibrant fintech gradient base (PhonePe style)
 * - Interlocking geometric ribbon loop forming a dynamic "D" (Google Pay style)
 * - Prominent 3D Folded Document with speed trails (CLEARLY FOR DOCUMENTS, NOT MONEY!)
 */
export function DoquMayLogo({ size = 56, showTagline = false }) {
  return (
    <div className="doqumay-brand-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: showTagline ? '12px' : '0' }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="doqumay-logo-svg"
        aria-label="DoquMay Logo"
      >
        <defs>
          {/* PhonePe inspired rich royal purple gradient base */}
          <linearGradient id="dqm-base-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A0E78" />
            <stop offset="45%" stopColor="#5F259F" />
            <stop offset="100%" stopColor="#1B033A" />
          </linearGradient>

          {/* Google Pay inspired vibrant cyan-blue ribbon */}
          <linearGradient id="dqm-ribbon-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F5A0" />
            <stop offset="50%" stopColor="#00D2FF" />
            <stop offset="100%" stopColor="#0066FF" />
          </linearGradient>

          {/* Google Pay inspired warm amber fold */}
          <linearGradient id="dqm-ribbon-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFDD00" />
            <stop offset="100%" stopColor="#FF7700" />
          </linearGradient>

          {/* Document Sheet White-Mint Gradient */}
          <linearGradient id="dqm-sheet-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E6F4FE" />
          </linearGradient>

          {/* Soft drop shadow */}
          <filter id="dqm-shadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* Squircle Background Badge (PhonePe / GPay standee aesthetic) */}
        <rect width="100" height="100" rx="26" fill="url(#dqm-base-grad)" filter="url(#dqm-shadow)" />
        <rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

        {/* Speed motion lines for instant file streaming */}
        <path d="M16 34h10M12 48h14M16 62h10" stroke="rgba(0, 245, 160, 0.45)" strokeWidth="3" strokeLinecap="round" />

        {/* Interlocking "D" Loop (Google Pay Ribbon Flow) */}
        <path
          d="M34 22 h18 c16 0 28 10 28 28 s-12 28 -28 28 H34 c-4.4 0 -8 -3.6 -8 -8 V30 c0 -4.4 3.6 -8 8 -8 z"
          fill="none"
          stroke="url(#dqm-ribbon-cyan)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* The Central Document Sheet (Clearly indicates Documents & Files, NOT Money) */}
        <path
          d="M36 26 h18 l14 14 v28 c0 3.3 -2.7 6 -6 6 H36 c-3.3 0 -6 -2.7 -6 -6 V32 c0 -3.3 2.7 -6 6 -6 z"
          fill="url(#dqm-sheet-grad)"
          filter="url(#dqm-shadow)"
        />

        {/* Document Folded Corner (Amber Gold Google Pay accent) */}
        <path
          d="M54 26 v14 h14 z"
          fill="url(#dqm-ribbon-gold)"
        />
        <path
          d="M54 26 v14 h14"
          fill="none"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="1"
        />

        {/* Document Content Lines (Simulating Text/File content) */}
        <line x1="38" y1="48" x2="60" y2="48" stroke="#0066FF" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="38" y1="56" x2="56" y2="56" stroke="#00D2FF" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="38" y1="64" x2="48" y2="64" stroke="#00F5A0" strokeWidth="2.5" strokeLinecap="round" />

        {/* Speed Flash Dot (Indicating Lightning Fast Transfer) */}
        <circle cx="78" cy="24" r="4.5" fill="#00F5A0" />
      </svg>

      {showTagline && (
        <div className="doqumay-text-col">
          <div className="doqumay-brand-name" style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#ffffff' }}>Doqu</span>
            <span style={{ color: '#00F5A0' }}>May</span>
          </div>
          <span className="doqumay-brand-sub" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00D2FF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚡ World’s 1st Fastest & Easiest Document Sender
          </span>
        </div>
      )}
    </div>
  );
}

// Standalone Logo component backwards-compatible with existing uses
export function Logo({ size = 56, showTagline = false }) {
  return <DoquMayLogo size={size} showTagline={showTagline} />;
}

/** SVG Data URI for embedding inside QR Code center & favicon */
export const DOQUMAY_QR_LOGO_DATA_URI = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%234A0E78"/><stop offset="50%" stop-color="%235F259F"/><stop offset="100%" stop-color="%231B033A"/></linearGradient><linearGradient id="rib" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300F5A0"/><stop offset="50%" stop-color="%2300D2FF"/><stop offset="100%" stop-color="%230066FF"/></linearGradient><linearGradient id="fld" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23FFDD00"/><stop offset="100%" stop-color="%23FF7700"/></linearGradient></defs><rect width="100" height="100" rx="26" fill="url(%23bg)"/><rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/><path d="M34 22 h18 c16 0 28 10 28 28 s-12 28 -28 28 H34 c-4.4 0 -8 -3.6 -8 -8 V30 c0 -4.4 3.6 -8 8 -8 z" fill="none" stroke="url(%23rib)" stroke-width="8" stroke-linecap="round"/><path d="M36 26 h18 l14 14 v28 c0 3.3 -2.7 6 -6 6 H36 c-3.3 0 -6 -2.7 -6 -6 V32 c0 -3.3 2.7 -6 6 -6 z" fill="%23ffffff"/><path d="M54 26 v14 h14 z" fill="url(%23fld)"/><line x1="38" y1="48" x2="60" y2="48" stroke="%230066FF" stroke-width="3" stroke-linecap="round"/><line x1="38" y1="56" x2="56" y2="56" stroke="%2300D2FF" stroke-width="3" stroke-linecap="round"/><line x1="38" y1="64" x2="48" y2="64" stroke="%2300F5A0" stroke-width="3" stroke-linecap="round"/><circle cx="78" cy="24" r="5" fill="%2300F5A0"/></svg>`;
