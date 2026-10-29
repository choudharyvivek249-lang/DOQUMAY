# Deploying Documay 24/7 Live for Everyone

To keep Documay online **24/7** for everyone with **free HTTPS** (required for phone camera QR code scanning) and **persistent permanent QR user identities**, deploy it with a managed PostgreSQL database.

---

## The Permanent User Identity Architecture

### Why Did Users Disappear After Deployments Previously?
Cloud web services such as Render, Railway, and Koyeb run containers on an **ephemeral disk**. When a web service is updated or redeployed from Git:
1. The old container and its local filesystem are completely destroyed.
2. A new container is created from the fresh Git commit.
3. Because `accounts.json` was stored only on the container's local disk (and ignored by `.gitignore`), all registered users created during previous runtime sessions were wiped out upon every deployment!
4. Visitors scanning `/receive/:username` would subsequently receive a `"User Not Found"` error modal.

### The Solution: Durable PostgreSQL Persistence
Documay now features a dual-mode persistence architecture:
- **Production (`DATABASE_URL` configured)**: Automatically connects to managed PostgreSQL with connection pooling (`pg.Pool`), SSL encryption, and idempotent migrations (`CREATE TABLE IF NOT EXISTS users`). User identities, passwords, and stable UUIDs persist permanently across all deployments and server restarts.
- **Local Development (No `DATABASE_URL`)**: Automatically falls back to durable local file storage in `server/data/accounts.json` with atomic writes and `.bak` backups.
- **Durable Health Check (`/api/health`)**: Inspects database connectivity and returns HTTP `503 Service Unavailable` if the database is disconnected, preventing false `404 User Not Found` reporting.

---

## Option 1: Render (Recommended – 100% Free with PostgreSQL)

Render provides free hosting with automatic HTTPS, managed PostgreSQL databases, and seamless GitHub Blueprint integration.

### Method A: Automatic Deployment via Blueprint (Easiest)
The repository includes a `render.yaml` Blueprint file pre-configured with:
- The `documay` Node.js web service.
- The `documay-db` managed PostgreSQL database.
- Automatic internal binding of `DATABASE_URL`.

To deploy:
1. Push your repository to GitHub.
2. In Render, click **New +** > **Blueprint**.
3. Connect your GitHub repository.
4. Render will read `render.yaml`, provision the web service and the PostgreSQL database together, and wire `DATABASE_URL` automatically.
5. Click **Apply**.

### Method B: Connecting PostgreSQL to an Existing Web Service
If you already have `https://doqumay.onrender.com` deployed as a Web Service:
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** > **PostgreSQL**.
3. Fill in the database settings:
   - **Name**: `documay-db`
   - **Database**: `documay`
   - **User**: `documay_user`
   - **Region**: Same region as your web service (e.g., `Oregon`).
   - **Plan**: `Free`.
4. Click **Create Database**.
5. Once created, scroll down to **Connections** and copy the **Internal Database URL** (e.g. `postgres://documay_user:...@dpg-...-a/documay`).
6. Navigate to your existing **documay** Web Service in the Render dashboard.
7. Go to **Environment** tab > **Add Environment Variable**:
   - **Key**: `DATABASE_URL`
   - **Value**: *(paste the Internal Database URL copied in Step 5)*
8. Click **Save Changes**. Render will automatically trigger a deployment.
9. On startup, Documay connects to PostgreSQL, creates the `users` table and unique username indexes, and logs:
   `[Database] ✓ PostgreSQL connection established successfully.`
   `[Database] ✓ PostgreSQL schema verified.`

---

## Restoring User Accounts After Ephemeral Disk Wipes

> [!IMPORTANT]
> **Data Recovery Notice for Past Accounts:**
> Because user accounts created prior to database configuration were saved only in the temporary container RAM/ephemeral disk, previously lost records cannot be mathematically reconstructed from a username alone (due to one-way scrypt password hashes).
> 
> **How to Re-establish Permanent Accounts:**
> 1. Complete account registration once on the live site (`https://doqumay.onrender.com`).
> 2. Create the desired username (e.g. `amir1`) and password.
> 3. The account is instantly written to the persistent PostgreSQL database.
> 4. All subsequent deployments, container restarts, and Git updates will **permanently preserve** the user and their `/receive/:username` QR standee profile!

---

## Environment Variables Reference

| Variable | Required in Production | Purpose | Example / Default |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string for permanent user persistence. | `postgres://user:pass@host:5432/documay` |
| `NODE_ENV` | **Yes** | Enables production mode and strict persistence error handling. | `production` |
| `PORT` | Auto-set by host | HTTP server port. | `3001` or dynamic `$PORT` |
| `FILE_TTL_MS` | Optional | Ephemeral file lifetime before automatic deletion. | `600000` (10 minutes) |

---

## Verifying the Production Permanent QR Flow

1. Open `/receive/your_username` (e.g. `https://doqumay.onrender.com/receive/amir1`).
2. When the user exists in PostgreSQL:
   - Displays avatar, recipient display name, and `📦 24/7 Drop-box Active` (or `● Online` if active in WebSocket).
   - Allows guests or registered senders to select documents and send files seamlessly.
3. If an unknown username is entered, returns a genuine `404 User Not Found`.
4. If the database is ever disconnected, returns `503 Service Unavailable`, preventing false missing-user reports.
5. Trigger a deployment restart in Render — reload `/receive/your_username` and verify that the user profile remains immediately accessible!


