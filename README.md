# Documay

Send photos and documents by scanning a QR code. No accounts, no permanent storage.
Files are deleted from the server **10 minutes** after they are sent; QR codes die after **2 minutes**.

```
documay/
├── server/                 Node.js + Express + Socket.io
│   ├── index.js            HTTP + WebSocket server, serves the built client in production
│   ├── socketHandlers.js   pairing, consent (accept/reject), chunked upload, progress events
│   ├── cleanup.js          cron task: deletes expired files and QR tokens every 10 s
│   ├── routes.js           GET /api/files/:id (download/preview, needs the per-file key)
│   ├── storage.js, state.js, config.js
│   └── test/flow.test.js   end-to-end test of the whole protocol (npm test)
└── client/                 React + Vite + Framer Motion
    └── src/
        ├── hooks/useDocumay.js        socket hook: connection, QR, consent, chunked sending
        ├── components/                WelcomeScreen, HomeScreen, QRModal, QRScanner,
        │                              TransferRoom, FileCard, IncomingModal, Avatar, Icons
        └── styles/app.css             olive + magenta theme
```

## Run it
Needs Node 18.12+.

```bash
npm install          # installs server and client (npm workspaces)
npm run dev          # server :3001 + client :5173
```
Open http://localhost:5173 in two browser windows (or one normal and one private window), enter two different names,
tap **My QR Code** in one and **Scan QR** in the other. On a desktop without a camera, use **Copy link instead** and paste it into the scanner's text box.

### Testing on real phones
Browsers only allow the camera on `https://` or `localhost`. For phone testing:
```bash
npm run dev:https    # self-signed certificate; open https://<your-computer-ip>:5173 and accept the warning
```
Or tunnel it (e.g. `ngrok http 5173`). Scanning a Documay QR with the phone's normal camera also works: it opens the link and pairs automatically after the name step.

### Production
```bash
npm run build && npm start     # one process on :3001 serves the API, WebSockets and the React app
```
Put it behind HTTPS (required for the camera). Set `CLIENT_ORIGIN=https://your-domain` if the client is hosted elsewhere (and `VITE_SERVER_URL` at build time).

## How a transfer works
1. **My QR Code** asks the server for a one-time token (valid 120 s, checked on the server). The QR contains `https://<host>/?join=<token>`.
2. The scanner sends the token; the server creates a private 1-to-1 room and tells both phones who they are paired with ("Connected via QR").
3. The sender picks a file → `file:offer`. The receiver sees *"Rahul Sharma is sending you a file: Resume.pdf (1.2 MB)"* with **Accept / Reject**.
4. On Accept the sender streams 512 KB chunks over Socket.io (one acknowledged chunk at a time); both phones show live progress.
5. When complete, the file sits in a temp folder on the server for 10 minutes. The receiver taps **Save**. The cleanup cron then deletes it and both cards show *"Deleted after 10 minutes"*.

## Rules enforced on the server (not just the UI)
- Types: png, jpg, jpeg, webp, pdf, doc, docx, xls, xlsx, ppt, pptx. Max 100 MB per file.
- No chunk is accepted before the receiver accepts; chunks must arrive in order and cannot exceed the declared size.
- Downloads need a random per-file key that only the two people in the room receive; the Content-Type comes from the allow-list, never from the uploader.
- QR tokens are random (144-bit), single-use and rate-limited to 10 scans a minute.
- Server restart wipes everything (all state is in memory; the temp folder is cleared on start and on shutdown).

## Notes / limits of this MVP
- One server process (state is in memory). To scale out you would add the Socket.io Redis adapter and shared storage.
- Files are not virus-scanned or content-sniffed; extension and size are checked.
- If a phone loses its connection it must scan again (rooms are not restored), but files already sent stay downloadable until their 10 minutes are up.

## Configuration (environment variables)
`PORT` (3001) · `CLIENT_ORIGIN` · `STORAGE_DIR` (system temp) · `SERVER_URL` (dev proxy target) · `VITE_SERVER_URL`.
