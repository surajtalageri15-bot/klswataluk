# VPS Setup

These commands deploy the app on Ubuntu/Debian VPS at `89.116.134.189`.

## 1. SSH Into The VPS

Run this in PowerShell:

```powershell
ssh root@89.116.134.189
```

Enter the VPS root password from your hosting provider.

## 2. Install Server Packages

Run on the VPS:

```bash
apt update
apt install -y curl git nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version
```

## 3. Create PostgreSQL Database

Run on the VPS:

```bash
sudo -u postgres psql
```

Inside PostgreSQL:

```sql
create user surveyor_user with encrypted password 'CHANGE_THIS_STRONG_PASSWORD';
create database karnataka_surveyors owner surveyor_user;
\q
```

## 4. Upload The Project

From your Windows PowerShell, run this from the project folder:

```powershell
scp -r . root@89.116.134.189:/opt/surveyor-app
```

Then SSH back into the VPS:

```powershell
ssh root@89.116.134.189
```

## 5. Configure App Environment

Run on the VPS:

```bash
cd /opt/surveyor-app
cat > .env <<'EOF'
DATABASE_URL=postgres://surveyor_user:CHANGE_THIS_STRONG_PASSWORD@localhost:5432/karnataka_surveyors
PGSSLMODE=disable
PORT=3000
EOF
npm ci
npm run import:pg
```

## 6. Run App As A Service

Run on the VPS:

```bash
useradd --system --home /opt/surveyor-app --shell /usr/sbin/nologin surveyor || true
chown -R surveyor:surveyor /opt/surveyor-app
cp /opt/surveyor-app/deploy/surveyor-app.service /etc/systemd/system/surveyor-app.service
systemctl daemon-reload
systemctl enable --now surveyor-app
systemctl status surveyor-app
```

## 7. Configure Nginx

Run on the VPS:

```bash
cp /opt/surveyor-app/deploy/nginx.conf /etc/nginx/sites-available/surveyor-app
ln -sf /etc/nginx/sites-available/surveyor-app /etc/nginx/sites-enabled/surveyor-app
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Now open:

`http://89.116.134.189`

## 8. Important Security Changes

After first login:

- Change admin password from `admin`.
- Do not share the VPS root password.
- Add a domain and SSL certificate before real public use.

For SSL after you connect a domain:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```
