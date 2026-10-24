# Documay – Test PRD

> **Version**: 1.0  
> **Date**: 24 October 2026  
> **Application**: Documay – Ephemeral QR-based file transfer  
> **Stack**: React + Vite (client) · Node.js + Express + Socket.io (server)

---

## 1. Application Overview

Documay lets two people exchange files by scanning a QR code. There are no accounts, no logins, and no permanent storage. Files auto-delete **10 minutes** after upload; QR codes expire after **2 minutes**. All state lives in server memory – a restart wipes everything.

---

## 2. Test Scope

| Area | Covered |
|---|---|
| Welcome / Name entry | ✔ |
| Home screen & connectivity | ✔ |
| QR code creation & expiry | ✔ |
| QR scanning & pairing | ✔ |
| File offer / consent flow | ✔ |
| Chunked upload & progress | ✔ |
| File download & preview | ✔ |
| Reject / Cancel / Expire flows | ✔ |
| Room leave & disconnect | ✔ |
| Server-side validation & security | ✔ |
| Cleanup & orphan deletion | ✔ |
| Responsive UI & animations | ✔ |
| Edge cases & error handling | ✔ |
| Performance & abuse limits | ✔ |

---

## 3. Functional Test Cases

### 3.1 Welcome Screen (Name Entry)

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| W-01 | Page loads correctly | Open `http://localhost:5173` | Welcome screen shows: Documay logo, heading, tagline "Send photos and documents by scanning a QR code. No sign-up, nothing saved.", name input, "Get Started" button (disabled), and 10-min auto-delete notice |
| W-02 | Empty name blocked | Leave input blank, click "Get Started" | Button stays disabled; nothing happens |
| W-03 | Whitespace-only name blocked | Enter `"   "` (spaces), click "Get Started" | Button stays disabled (`.trim()` produces empty string) |
| W-04 | Valid name proceeds | Enter `"Rahul Sharma"`, click "Get Started" | Navigates to Home screen; name shown in header |
| W-05 | Name max length (24 chars) | Type 30+ characters | Input `maxLength={24}` truncates to 24 characters |
| W-06 | Name stored in sessionStorage | Enter name, check `sessionStorage.getItem('documay:name')` | Value matches entered name |
| W-07 | Session-only persistence | Enter name → close tab → reopen same URL | Welcome screen shows again (sessionStorage is tab-scoped) |
| W-08 | Control characters stripped | Send name with embedded `\x00\x1f` via socket | Server returns cleaned name (control chars removed) |
| W-09 | Spring animation on load | Open page | Form animates in with spring physics (y: 24→0, opacity: 0→1) |

### 3.2 Home Screen

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| H-01 | Home screen layout | Enter name | Shows: avatar with initials, greeting "Hi, {name}", status dot, "Scan QR" button, "My QR Code" button, footer with "Change name" link |
| H-02 | Online status indicator | Server running, socket connected | Green dot, text "Online" |
| H-03 | Connecting state | Stop server / disconnect | Dot not green, text "Connecting…" |
| H-04 | Buttons disabled when offline | Disconnect socket | "Scan QR" and "My QR Code" buttons are `disabled` |
| H-05 | Change name | Click "Not {firstName}? Change name" | Returns to Welcome screen; sessionStorage cleared |
| H-06 | Avatar initials (single name) | Name = "Priya" | Avatar shows "P" |
| H-07 | Avatar initials (two names) | Name = "Rahul Sharma" | Avatar shows "RS" |
| H-08 | Scan QR opens scanner | Click "Scan QR" button | QR Scanner overlay opens |
| H-09 | My QR Code opens modal | Click "My QR Code" button | QR Modal sheet slides up from bottom |

### 3.3 QR Code Creation & Expiry

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| Q-01 | QR auto-generated on modal open | Click "My QR Code" | QR code appears immediately; countdown starts at 2:00 |
| Q-02 | QR contains correct URL | Inspect QR data | Value is `{origin}/?join={token}` |
| Q-03 | Token is 144-bit (18 bytes base64url) | Check token format | 24 characters, base64url alphabet `[A-Za-z0-9_-]` |
| Q-04 | Countdown timer | Wait and observe | Timer counts down in `M:SS` format; progress bar shrinks |
| Q-05 | QR expires after 2 minutes | Wait 2 minutes | QR blurs with "QR expired" overlay; "Codes last 2 minutes so no one can reuse them." message shown |
| Q-06 | Refresh QR after expiry | Click "Refresh QR" | New QR code generated; timer resets to 2:00 |
| Q-07 | Copy link | Click "Copy link instead" | Link copied to clipboard; text changes to "Link copied" for 1.5s |
| Q-08 | Old token invalidated on new QR | Create QR → note token → create another QR | Old token deleted from server; scanning old token fails |
| Q-09 | Close modal | Click close (×) or backdrop | Modal slides away; overlay dismissed |
| Q-10 | QR expiry on server | Wait 2+ minutes, then try to scan expired token | Server returns error: "This QR code has expired. Ask them to tap Refresh QR." |

### 3.4 QR Scanning & Pairing

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| S-01 | Camera scanner opens | Click "Scan QR" on Home | Scanner overlay opens; camera starts (if permitted) |
| S-02 | Camera permission denied | Deny camera access | Friendly error: "Camera access is blocked. Allow the camera in your browser settings, or paste the link below." |
| S-03 | Non-HTTPS camera error | Access from HTTP (not localhost) | Error: "Browsers only allow the camera on https:// or localhost." |
| S-04 | Manual link entry | Paste full URL `http://localhost:5173/?join=TOKEN` in text box, click "Connect" | Token parsed correctly; pairing proceeds |
| S-05 | Manual bare token entry | Paste raw 24-char token | Token recognized and scanned |
| S-06 | Invalid QR / link | Scan random QR or paste gibberish | Error: "That doesn't look like a Documay QR code." |
| S-07 | Successful pairing | User A shows QR, User B scans | Both users enter Transfer Room; A sees `role: "owner"`, B sees `role: "scanner"`; both see each other's name and "Connected via QR" badge |
| S-08 | Self-scan blocked | Scan your own QR code | Error: "That's your own QR code. Scan someone else's." |
| S-09 | Token single-use | Scan same QR a second time | Error: "This QR code has expired..." (token deleted after first scan) |
| S-10 | Rate limit (10 scans/min) | Rapidly fire 11 `qr:scan` events in under 60s | 11th scan returns: "Too many attempts. Wait a minute and try again." |
| S-11 | Auto-pair via URL | Open `/?join=TOKEN` in browser | After entering name, auto-pairs without needing to open scanner |
| S-12 | URL cleaned after auto-pair | Auto-pair via `/?join=TOKEN` | URL bar changes to `/` (query param removed via `replaceState`) |
| S-13 | Owner offline | Scan QR after owner disconnected | Error: "That person is no longer online." |
| S-14 | Previous room torn down | User A in room with B → B scans C's QR | A and B's old room is destroyed; A gets `peer:left` event |

### 3.5 Transfer Room

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| R-01 | Room layout | Pair two users | Shows: back button, peer avatar + name, "Connected via QR" badge, empty room message, "Attach a file" button, accepted file types list |
| R-02 | Empty room message | No files sent yet | "You're connected. Tap the paperclip to send a photo or document. {peerName} will be asked to accept it first." |
| R-03 | File picker | Click "Attach a file" | Native file picker opens; accepts `.png, .jpg, .jpeg, .webp, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx` |
| R-04 | Attach disabled when peer offline | Peer disconnects | Button text changes to "Scan again to reconnect"; button disabled |
| R-05 | Leave room | Click back arrow | Returns to Home screen; room destroyed; peer gets `peer:left` |
| R-06 | Auto-scroll | Send multiple files | List auto-scrolls to newest file card |

### 3.6 File Transfer – Consent Flow

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| F-01 | File offer (sender view) | Sender picks `Report.pdf` (1.2 MB) | Sender sees file card: name, size, "Waiting for {peer} to accept…", Cancel link |
| F-02 | Incoming modal (receiver view) | Sender offers file | Receiver sees modal: sender avatar, "{SenderName} is sending you a file: **Report.pdf** (1.2 MB)", Accept and Reject buttons |
| F-03 | Multiple pending indicator | Sender offers 3 files rapidly | Receiver modal shows first file + "+2 more waiting" text |
| F-04 | Accept file | Receiver clicks Accept | Upload begins; both sides see progress bar with percentage |
| F-05 | Reject file | Receiver clicks Reject | Sender card shows "{peer} declined this file"; receiver card shows "You declined this file" |
| F-06 | Cancel by sender (before accept) | Sender clicks Cancel on offered file | Both cards show "Transfer cancelled" |
| F-07 | Cancel by sender (during upload) | Sender clicks Cancel while uploading | Upload stops; both cards show "Transfer cancelled" |
| F-08 | Cancel by receiver | Receiver cancels active transfer | Both cards show "Transfer cancelled" |

### 3.7 Chunked Upload & Progress

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| U-01 | Small file (< 512 KB) | Send 100 KB PNG | Uploads in 1 chunk; progress jumps from 0% to 100% |
| U-02 | Multi-chunk file | Send 1.5 MB PDF | Uploads in 3 chunks (512 KB each); progress bar updates at each chunk |
| U-03 | Large file (close to 100 MB) | Send ~99 MB file | All chunks sent sequentially; both sides see smooth progress |
| U-04 | Upload completes successfully | Full file uploaded | Status changes to "ready"; sender card shows "Delivered"; receiver card shows "Received" |
| U-05 | Progress bar accuracy | Monitor during upload | `aria-valuenow` matches `Math.round(received/size * 100)` |
| U-06 | Sequential uploads | Queue multiple accepted files | Files upload one at a time (queue mechanism prevents parallel uploads) |

### 3.8 File Download & Preview

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| D-01 | Save button appears | Transfer completes | "Save" link with download icon appears on file card |
| D-02 | Download file | Click "Save" | Browser downloads file; `Content-Disposition: attachment; filename*=UTF-8''{encodedName}` |
| D-03 | Downloaded file integrity | Compare downloaded bytes to original | Byte-for-byte identical |
| D-04 | Image thumbnail | Send PNG/JPG/WEBP | Completed card shows inline thumbnail preview |
| D-05 | Non-image: no thumbnail | Send PDF/DOCX | Card shows extension badge (e.g., "pdf", "docx") instead of thumbnail |
| D-06 | Correct Content-Type | Download PDF | Response header `Content-Type: application/pdf` (from server allow-list, not user-supplied) |
| D-07 | Auto-delete countdown | After delivery | Card shows "Auto-deletes in M:SS" countdown |
| D-08 | Wrong download key | Request `/api/files/{id}?key=wrong` | HTTP 404 with message: "This file is gone. Files are deleted 10 minutes after they are sent." |
| D-09 | Download after expiry | Wait 10 minutes, try Save | HTTP 404; card shows "Deleted after 10 minutes" |

### 3.9 File Expiry & Cleanup

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| E-01 | File expires after 10 min | Complete transfer, wait 10 minutes | Sweep cron deletes file; both sides get `transfer:update` with `status: "expired"` |
| E-02 | Card shows expired state | After expiry | Card text: "Deleted after 10 minutes" |
| E-03 | Expired QR tokens cleaned | QR created, wait 2+ min | `qrTokens` map entry removed by sweep |
| E-04 | Orphan file cleanup | Crash leaves file on disk with no transfer record | Next sweep detects file older than TTL, deletes it |
| E-05 | Sweep interval | Observe server | Cleanup runs every 10 seconds (configurable via `SWEEP_CRON`) |

---

## 4. Server-Side Validation & Security Tests

### 4.1 File Type & Size Enforcement

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| V-01 | Allowed extensions | Offer `.png, .jpg, .jpeg, .webp, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx` | All accepted |
| V-02 | Blocked extension (.exe) | `file:offer { name: 'virus.exe', size: 10 }` | Error: "Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files are allowed." |
| V-03 | Blocked extension (.sh) | `file:offer { name: 'script.sh', size: 10 }` | Same error as V-02 |
| V-04 | No extension | `file:offer { name: 'noext', size: 10 }` | Same error as V-02 |
| V-05 | Double extension trick | `file:offer { name: 'photo.exe.png', size: 10 }` | Accepted (last extension is `.png`) |
| V-06 | Empty file | `file:offer { name: 'empty.pdf', size: 0 }` | Error: "That file looks empty." |
| V-07 | Negative size | `file:offer { name: 'a.pdf', size: -1 }` | Error: "That file looks empty." |
| V-08 | Over 100 MB | `file:offer { name: 'big.pdf', size: 104857601 }` | Error: "Files can be up to 100 MB." |
| V-09 | Exactly 100 MB | `file:offer { name: 'max.pdf', size: 104857600 }` | Accepted |
| V-10 | Server storage full (1 GB total) | Enough files to exceed 1 GB stored | Error: "The server is busy right now. Try again in a few minutes." |
| V-11 | Max active transfers per user (10) | 11th concurrent `file:offer` from same user | Error: "Too many files waiting. Let some finish first." |

### 4.2 Chunk Validation

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| C-01 | Chunk before accept | Send `file:chunk` while status is "offered" | Error: "This transfer is not active." |
| C-02 | Out-of-order chunk | Send chunk with `offset !== t.received` | Error: "Chunk does not match the declared file size." |
| C-03 | Oversized chunk (> 1 MB) | Send chunk with `data.length > 1048576` | Error: "Bad chunk." |
| C-04 | Empty chunk | Send chunk with empty Uint8Array | Error: "Bad chunk." |
| C-05 | Chunk exceeds declared size | Total `received + data.length > size` | Error: "Chunk does not match the declared file size." |
| C-06 | Non-Uint8Array data | Send chunk with string data | Error: "Bad chunk." |
| C-07 | Concurrent chunks (busy flag) | Two chunks arrive simultaneously | Second gets: "Chunks arrived out of order." |
| C-08 | Complete before all chunks | Call `file:complete` with `received !== size` | Error: "The file is incomplete." |

### 4.3 Session & Auth

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| A-01 | Action without name | Emit any event before `session:start` | Error: "Enter your name first." |
| A-02 | Empty name in session:start | `session:start { name: '' }` | Error: "Please enter a display name." |
| A-03 | Name truncated to 24 chars | `session:start { name: 'A'.repeat(30) }` | Name stored as 24 characters |
| A-04 | File offer without room | Send `file:offer` without being paired | Error: "Connect with someone first by scanning a QR code." |
| A-05 | Accept transfer you don't own | User A tries to accept User B's incoming transfer | Returns null from `owned()` check; error returned |
| A-06 | Cancel someone else's transfer | `file:cancel` with another user's transfer ID | Error: "Nothing to cancel." |

### 4.4 Download Security

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| X-01 | Timing-safe key comparison | Uses `crypto.timingSafeEqual` | No timing side-channel for key guessing |
| X-02 | Content-Type from allow-list | Upload file, check download response | `Content-Type` set from `ALLOWED_TYPES[ext]`, not from uploader |
| X-03 | X-Content-Type-Options | Download any file | Response header: `X-Content-Type-Options: nosniff` |
| X-04 | Cache-Control: no-store | Download any file | Response header: `Cache-Control: no-store` |
| X-05 | File path traversal | Transfer ID with `../../etc/passwd` | `filePath()` uses `path.join(STORAGE_DIR, id)` – stays within storage dir |
| X-06 | Filename sanitization | File name with `../../evil.pdf` or `..\\evil.pdf` | `cleanFile()` extracts basename and strips path separators |
| X-07 | Download key only shared in room | Observe `transfer:update` events | `key` field only emitted when `status === 'ready'` and only to `senderId` and `receiverId` |
| X-08 | x-powered-by disabled | Check response headers | No `X-Powered-By` header present |

---

## 5. WebSocket & Connection Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| W-01 | Disconnect clears user | Close browser tab | Server removes user from `users` map; QR tokens owned by user deleted |
| W-02 | Disconnect notifies peer | User A connected to B; A closes tab | B receives `peer:left` event; badge changes to "Disconnected" |
| W-03 | In-flight transfers cancelled on disconnect | Active upload, sender disconnects | Transfer status set to "cancelled"; receiver notified |
| W-04 | Completed files survive disconnect | File is "ready", sender disconnects | File remains downloadable until 10-min TTL expires |
| W-05 | Reconnection after disconnect | Lose connection, socket reconnects | `session:start` re-emitted; user goes back to "Online" state |
| W-06 | Transport fallback | WebSocket blocked | Falls back to polling transport |
| W-07 | Socket.io max buffer | Single message > 2 MB | Rejected by `maxHttpBufferSize` (2 MB limit) |

---

## 6. UI / UX Tests

### 6.1 Responsive & Visual

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| UI-01 | Mobile viewport | Open on 375×812 (iPhone) | All screens fit without horizontal scroll; touch targets ≥ 44px |
| UI-02 | Desktop viewport | Open on 1440×900 | Centered layout; maximum width constraint applied |
| UI-03 | Manrope font loaded | Inspect text | Font-family is "Manrope" (loaded from Google Fonts) |
| UI-04 | Theme color | Check `<meta name="theme-color">` | Value is `#eef2eb` |
| UI-05 | Favicon renders | Check tab icon | SVG favicon with olive→pink gradient and white document icon |

### 6.2 Animations

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| AN-01 | Welcome → Home transition | Enter name | Smooth crossfade (`AnimatePresence mode="wait"`) |
| AN-02 | Home → Room transition | Pair via QR | Slide-in from right (x: 40→0) with spring physics |
| AN-03 | QR Modal entrance | Open "My QR Code" | Sheet slides up from bottom (y: 100%→0) |
| AN-04 | Incoming file modal | File offered to receiver | Modal scales in (0.88→1) with spring bounce |
| AN-05 | File card appears | New file sent/received | Card animates in (y: 14→0, scale: 0.97→1) |
| AN-06 | Toast notification | Error or info event | Slides up (y: 40→0), auto-dismisses after 4 seconds |
| AN-07 | Button tap feedback | Tap any primary button | Scale to 0.97 on press (Framer Motion `whileTap`) |

### 6.3 Accessibility

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| AC-01 | Dialog roles | Open QR modal / scanner / incoming modal | `role="dialog"` or `role="alertdialog"` with `aria-modal="true"` |
| AC-02 | Progress bar | During upload | `role="progressbar"` with `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100` |
| AC-03 | Status indicator | Connection state | `role="status"` with `aria-label` on status dot |
| AC-04 | Auto-focus | Incoming file modal opens | Accept button has `autoFocus` |
| AC-05 | Live region | File list | `aria-live="polite"` on file list container |
| AC-06 | Keyboard navigation | Tab through Welcome form | Input → Button are focusable and operable via keyboard |

---

## 7. Edge Cases & Error Handling

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| EC-01 | Server unreachable | Start client without server | Toast: "Can't reach the Documay server." |
| EC-02 | Server timeout | Server takes > 30s to respond | Toast: "The server took too long to answer." |
| EC-03 | Offer to disconnected peer | Peer disconnects after pairing, before offer | Error: "The other person is no longer connected." |
| EC-04 | Accept already-cancelled offer | Sender cancels, receiver clicks Accept | Error: "This request is no longer available." |
| EC-05 | Double accept | Accept same transfer twice | Second accept: "This request is no longer available." (status already changed) |
| EC-06 | Reject already-accepted offer | Timing: accept and reject race | One succeeds, other gets "This request is no longer available." |
| EC-07 | Complete non-uploading transfer | Call `file:complete` on "offered" status | Error: "This transfer is not active." |
| EC-08 | Unicode filename | Send file named `日本語テスト.pdf` | Filename preserved; download uses RFC 5987 encoding (`filename*=UTF-8''...`) |
| EC-09 | Filename with spaces | Send `Report Q3 2026.pdf` | URL-encoded in Content-Disposition; downloads correctly |
| EC-10 | Very long filename (120+ chars) | Send file with 200-char name | Truncated to 120 characters by `cleanFile()` |
| EC-11 | Server restart mid-transfer | Restart Node.js during upload | All state lost; connected clients get `disconnect` → must re-pair |
| EC-12 | Storage dir missing | Delete `STORAGE_DIR` while server runs | `initStorage()` recreates on next start; orphan cleanup handles missing dir gracefully |
| EC-13 | Client-side file validation | Select `.exe` file in picker | Toast: "{filename}: Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files can be sent." (blocked before server round-trip) |
| EC-14 | Empty file client-side | Select 0-byte file | Toast: "{filename}: That file is empty." |

---

## 8. Performance & Load Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| P-01 | Multiple concurrent rooms | 20 paired users transferring simultaneously | All rooms operate independently; no cross-talk |
| P-02 | Rapid QR creation | User creates 50 QR codes in 1 min | Old tokens deleted; only latest token valid |
| P-03 | Large file throughput | Transfer 100 MB file | Completes within reasonable time (~30s on localhost); no memory spike |
| P-04 | Cleanup sweep performance | 1000 expired transfers | Sweep completes in < 1 second |
| P-05 | Max stored bytes enforcement | Gradually fill 1 GB of temp storage | New offers rejected with "server is busy" message |

---

## 9. Configuration & Environment

| Variable | Default | Test |
|---|---|---|
| `PORT` | 3001 | Set `PORT=4000` → server listens on 4000 |
| `CLIENT_ORIGIN` | `true` (any) | Set to specific origin → CORS enforced |
| `STORAGE_DIR` | OS temp dir + `/documay-files` | Set custom path → files stored there |
| `QR_TTL_MS` | 120000 (2 min) | Set to 5000 → QR expires in 5s |
| `FILE_TTL_MS` | 600000 (10 min) | Set to 10000 → file deleted in 10s |
| `SWEEP_CRON` | `*/10 * * * * *` | Set to `*/1 * * * * *` → sweeps every 1s |
| `SERVER_URL` | `http://localhost:3001` | Set custom → Vite proxy target changes |
| `VITE_SERVER_URL` | empty (same origin) | Set for split deployment |

---

## 10. Existing Automated Tests

The server includes an end-to-end test at [`flow.test.js`](file:///c:/xampp/htdocs/documay/server/test/flow.test.js) that validates the core protocol:

| Covered | Check |
|---|---|
| ✔ | QR creation with server-side TTL |
| ✔ | Cannot scan own QR |
| ✔ | 1-to-1 room creation with peer names |
| ✔ | QR is single-use |
| ✔ | QR expiry after TTL |
| ✔ | `.exe` rejection |
| ✔ | > 100 MB rejection |
| ✔ | Consent required before chunks |
| ✔ | Chunked upload + progress events |
| ✔ | Out-of-order chunk refused |
| ✔ | Download integrity (byte-for-byte) |
| ✔ | Wrong key → 404 |
| ✔ | Reject notifies sender |
| ✔ | File auto-deleted after TTL |
| ✔ | `peer:left` on disconnect |

**Run**: `npm test -w server` (requires Node 18.12+)

---

## 11. Manual Testing Checklist

### Prerequisites
- [ ] Node.js 18.12+ installed
- [ ] `npm install` completed
- [ ] `npm run dev` running (server :3001, client :5173)
- [ ] Two browser windows open (or one normal + one incognito)

### Happy Path – End to End
- [ ] **Window 1**: Enter name "Rahul" → Home screen → Click "My QR Code" → QR appears with 2-min timer
- [ ] **Window 2**: Enter name "Priya" → Home screen → Click "Scan QR" → Paste copied link → Click Connect
- [ ] Both windows enter Transfer Room showing each other's name + "Connected via QR"
- [ ] **Window 2 (Priya)**: Click "Attach a file" → Select `test.pdf`
- [ ] **Window 1 (Rahul)**: Sees incoming modal → "{Priya} is sending you a file: test.pdf" → Click Accept
- [ ] Both windows show upload progress bar updating in real-time
- [ ] Transfer completes: Sender sees "Delivered", Receiver sees "Received" + "Save" button
- [ ] Click "Save" → file downloads correctly
- [ ] Wait 10 min → card shows "Deleted after 10 minutes"

### Error Paths
- [ ] Try scanning expired QR → error message shown
- [ ] Send `.exe` file → client-side rejection toast
- [ ] Reject incoming file → sender notified of rejection
- [ ] Cancel mid-upload → both sides see "Transfer cancelled"
- [ ] Close one tab → other tab shows "Disconnected" badge
- [ ] Click back arrow → returns to Home; peer gets `peer:left`

---

## 12. Test Environment Setup

```bash
# Install dependencies
npm install

# Run dev servers (server: 3001, client: 5173)
npm run dev

# Run automated tests
npm test -w server

# For phone/camera testing with HTTPS
npm run dev:https
# Open https://<your-ip>:5173 on phone

# Override timers for faster testing
QR_TTL_MS=5000 FILE_TTL_MS=10000 SWEEP_CRON="*/1 * * * * *" npm run dev
```
