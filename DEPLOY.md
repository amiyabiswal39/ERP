# Deploying ERP to an EC2 Ubuntu instance (native + nginx)

This deploys the app **natively** on one Ubuntu EC2 instance:

- **nginx** (host) serves the built React SPA and reverse-proxies `/api` → Node.
- **Node API** runs under **systemd** (auto-restart, survives reboot).
- **PostgreSQL** runs on the same host (via apt).

```
            ┌────────────── EC2 (Ubuntu) ──────────────┐
Internet ─► nginx :80 ─┬─► / (static)  apps/web/dist     │
                       └─► /api ─► Node API :4000 ─► Postgres :5432
            └───────────────────────────────────────────┘
```

> All paths below assume the repo lives at **`/opt/erp/ERP`** on the server.

---

## 0. Launch the EC2 instance

- AMI: **Ubuntu Server 22.04 or 24.04 LTS**, type **t3.small** or larger (1 GB RAM is tight for `npm`/Vite builds — t3.small/2 GB recommended; or build locally, see note at the end).
- **Security Group inbound:** allow `22` (SSH, your IP), `80` (HTTP, anywhere), and `443` if you add TLS later. **Do not** expose `4000` or `5432`.
- SSH in:
  ```bash
  ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_DNS
  ```

## 1. Install system dependencies

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 (NodeSource — installs to /usr/bin/node so systemd can find it)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL + nginx + git
sudo apt install -y postgresql postgresql-contrib nginx git

node -v && npm -v && psql --version && nginx -v
```

## 2. Create the database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER erp WITH PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE erp OWNER erp;
GRANT ALL PRIVILEGES ON DATABASE erp TO erp;
SQL
```

## 3. Get the code

```bash
sudo mkdir -p /opt/erp && sudo chown ubuntu:ubuntu /opt/erp
cd /opt/erp
git clone https://github.com/amiyabiswal39/ERP.git
cd ERP
```

## 4. Configure the API environment

```bash
cp deploy/api.env.example apps/api/.env
nano apps/api/.env
```
Set:
- `DATABASE_URL` — use the password from step 2.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — run `openssl rand -hex 32` for each.
- `CORS_ORIGIN` — `http://YOUR_EC2_PUBLIC_DNS` (or your domain).
- keep `NODE_ENV=production`, `PORT=4000`.

## 5. Install deps & build everything

```bash
cd /opt/erp/ERP
npm install                              # all workspaces
npm run build -w @erp/shared             # shared types
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run build -w @erp/api                # compiles API to apps/api/dist
npm run build -w @erp/web                # builds SPA to apps/web/dist (uses .env.production -> relative /api)
```

## 6. Create the database schema + seed demo data

```bash
cd /opt/erp/ERP
# DATABASE_URL is read from apps/api/.env by prisma here:
set -a; . apps/api/.env; set +a
npx prisma db push --schema apps/api/prisma/schema.prisma
npm run db:seed -w @erp/api              # optional demo data (admin@erp.test / Password123!)
```

> Remove or change the seeded demo users before exposing this publicly.

## 7. Run the API as a service

```bash
sudo cp deploy/erp-api.service /etc/systemd/system/erp-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now erp-api
sudo systemctl status erp-api --no-pager      # should be "active (running)"
curl -s http://127.0.0.1:4000/health          # {"status":"ok",...}
```
Logs: `journalctl -u erp-api -f`

## 8. Configure nginx

```bash
sudo cp deploy/nginx-erp.conf /etc/nginx/sites-available/erp
# Edit server_name to your EC2 DNS/domain (optional but recommended):
sudo nano /etc/nginx/sites-available/erp
sudo ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp
sudo rm -f /etc/nginx/sites-enabled/default     # remove the default welcome page
sudo nginx -t                                    # test config
sudo systemctl reload nginx
```

Open **`http://YOUR_EC2_PUBLIC_DNS`** in a browser → log in with `admin@erp.test` / `Password123!`.

---

## 9. (Recommended) Add HTTPS with a domain

Point an A record at the EC2 IP, then:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.yourdomain.com
```
Certbot edits the nginx config and auto-renews. Update `CORS_ORIGIN` in `apps/api/.env` to `https://erp.yourdomain.com` and `sudo systemctl restart erp-api`.

## 10. Updating after a `git push`

```bash
cd /opt/erp/ERP
git pull
npm install
npm run build -w @erp/shared
npx prisma generate --schema apps/api/prisma/schema.prisma
npx prisma db push --schema apps/api/prisma/schema.prisma   # if schema changed
npm run build -w @erp/api
npm run build -w @erp/web
sudo systemctl restart erp-api
sudo systemctl reload nginx
```

---

## Notes & troubleshooting

- **Low-RAM instances (t2.micro / 1 GB):** the Vite build can OOM. Either size up to t3.small, add a swap file:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
  …or build locally and `scp` the `apps/web/dist` and `apps/api/dist` folders up.
- **502 Bad Gateway** → the API isn't running: `sudo systemctl status erp-api`, `journalctl -u erp-api -e`.
- **Blank page / API calls fail** → confirm the SPA was built with `apps/web/.env.production` present (relative `/api`), and that nginx `location /api/` has **no trailing slash** on `proxy_pass`.
- **DB connection errors** → verify `DATABASE_URL` password matches step 2 and Postgres is running: `sudo systemctl status postgresql`.

## Alternative: Docker Compose (simplest, if you prefer)

The repo ships a `docker-compose.yml` (postgres + api + web). On an instance with Docker installed:
```bash
sudo apt install -y docker.io docker-compose-plugin
cd /opt/erp/ERP && cp .env.example .env   # edit secrets
sudo docker compose up -d --build
```
This brings up everything (web on `:5173`). To still front it with host nginx, proxy `/` → `:5173` and `/api` → `:4000`.
