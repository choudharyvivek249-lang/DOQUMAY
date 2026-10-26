# Deploying Documay 24/7 Live for Everyone

To keep Documay online **24/7** for everyone with **free HTTPS** (required for phone camera QR code scanning), deploy it to a cloud platform like **Render**, **Koyeb**, or **Railway**.

---

## Why Cloud Hosting?
1. **Always Online (24/7)**: Runs in the cloud even when your PC is turned off.
2. **Automatic Free HTTPS (SSL)**: Modern mobile browsers (iOS Safari, Android Chrome) block camera access for QR scanning on non-HTTPS connections. Cloud hosts provide HTTPS out of the box.
3. **WebSockets & Node.js Ready**: Full support for real-time Socket.io pairing and chunked file transfer.

---

## Option 1: Render (Recommended – 100% Free)

Render provides free hosting with automatic HTTPS and seamless GitHub integration.

### Step 1: Push your project to GitHub
If you haven't uploaded your code to GitHub yet:
1. Create a new repository on [github.com](https://github.com/new) (e.g., `documay`).
2. Push your code using Git or GitHub Desktop:
   ```bash
   git init
   git add .
   git commit -m "Deploy Documay"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/documay.git
   git push -u origin main
   ```
   *(If you don't have Git installed, install it in PowerShell with: `winget install --id Git.Git -e`)*

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) and sign up / log in with your GitHub account.
2. Click **New +** > **Web Service**.
3. Select your `documay` GitHub repository.
4. Render will auto-detect settings, or configure:
   - **Name**: `documay` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Click **Create Web Service**.
6. Within 2 minutes, your site will be live at `https://documay-xxxx.onrender.com`.

### Step 3: Keep it Awake 24/7 (Prevent Free Sleep)
Render's free tier spins down after 15 minutes of inactivity. To keep it awake 24/7 for free:
1. Go to [cron-job.org](https://cron-job.org) or [uptimerobot.com](https://uptimerobot.com) (free accounts).
2. Create a monitor/cron job:
   - **URL**: `https://<your-render-subdomain>.onrender.com/api/health`
   - **Interval**: Every 5 or 10 minutes.
3. This sends a lightweight ping that keeps your Documay server running 24/7 without ever going to sleep!

---

## Option 2: Koyeb (Free Always-On Instance)

Koyeb offers a free Eco instance that runs continuously without spinning down:
1. Go to [koyeb.com](https://www.koyeb.com) and connect GitHub.
2. Choose **GitHub repository** > `documay`.
3. Choose **Dockerfile** (already configured in the repository) or Node build.
4. Set port to `3001` or let it detect `$PORT`.
5. Click **Deploy**. Your app is live 24/7 with automatic SSL.

---

## Option 3: Railway

1. Go to [railway.app](https://railway.app).
2. Click **New Project** > **Deploy from GitHub repo**.
3. Railway automatically uses the included `Dockerfile` and `railway.json`.
4. Under the service settings, click **Generate Domain** to get a public `https://...` address.

---

## Recommended Environment Variables

In your cloud host's Environment Variables settings, you can optionally configure:

| Variable | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and security headers. |
| `PIN_PEPPER` | `any-random-secret-string` | Server-side secret pepper protecting 4-digit PIN hashes. |
| `PORT` | `3001` *(auto-set by most hosts)* | Port the Node.js server listens on. |
| `FILE_TTL_MS` | `600000` *(10 minutes)* | Ephemeral file lifetime before automatic deletion. |

---

## Testing Your Live Deployment

1. Open your live URL (e.g. `https://your-app.onrender.com` or `https://...railway.app`) on your computer or phone.
2. Complete first-time account setup with a username, password, and your personal **4-digit Send PIN** (e.g. `0427`).
3. Click **Standee QR** to view or share your permanent recipient QR code.
4. From another phone or browser window, scan the QR code or visit `/?to=your_username`.
5. Select a file, click **Send**, enter your **4-digit Send PIN** to authorize, and hand off directly to **WhatsApp**!

