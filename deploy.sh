#!/usr/bin/env bash
# Deploys the Web IDE on Ubuntu (20.04+). Run as root (or with sudo). Safe to re-run: it updates and restarts.
#
#   sudo bash deploy.sh                                   # http://SERVER_IP:3000
#   sudo DOMAIN=ide.example.com EMAIL=me@example.com bash deploy.sh   # Nginx + HTTPS (Let's Encrypt)
#
#   sudo LOCAL_ONLY=1 PORT=3000 bash deploy.sh           # behind an existing reverse proxy (Caddy, Nginx…):
#                                                         # listens on 127.0.0.1 only, opens no firewall port
#
# Optional variables: PORT (3000), BRANCH, REPO_URL, APP_DIR (/opt/webide), LOCAL_ONLY (0)
set -euo pipefail

PORT="${PORT:-3000}"
BRANCH="${BRANCH:-claude/web-ide-engine-5iccld}"
REPO_URL="${REPO_URL:-https://github.com/mygummy0/project.git}"
APP_DIR="${APP_DIR:-/opt/webide}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
LOCAL_ONLY="${LOCAL_ONLY:-0}"
APP_USER="webide"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash deploy.sh"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || echo "Warning: tested for Ubuntu only (detected: ${ID:-unknown})."
[ -z "$DOMAIN" ] || [ -n "$EMAIL" ] || die "DOMAIN requires EMAIL (used for Let's Encrypt expiry notices)."

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg

node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//' || echo 0; }
if [ "$(node_major)" -lt 20 ] 2>/dev/null || ! command -v node >/dev/null; then
  log "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v), npm $(npm -v)"

log "Fetching code ($BRANCH)"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
# The checkout is owned by $APP_USER, so root must be told explicitly that this directory is trusted
# (otherwise git refuses with "detected dubious ownership" on every update).
GIT="git -c safe.directory=$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  $GIT -C "$APP_DIR" fetch origin "$BRANCH"
  $GIT -C "$APP_DIR" checkout -f -B "$BRANCH" "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

log "Installing dependencies and building (this takes a few minutes)"
# Runs as the unprivileged service user so build scripts never run as root.
runuser -u "$APP_USER" -- bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

# With a domain, Next.js listens on localhost only and Nginx is the public entry point.
HOST="0.0.0.0"
{ [ -n "$DOMAIN" ] || [ "$LOCAL_ONLY" = 1 ]; } && HOST="127.0.0.1"

log "Creating systemd service"
cat >/etc/systemd/system/webide.service <<EOF
[Unit]
Description=Web IDE (Next.js)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$(command -v npm) run start -w @webide/web -- -p $PORT -H $HOST
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable webide >/dev/null
systemctl restart webide

if [ "$LOCAL_ONLY" = 1 ] && [ -z "$DOMAIN" ]; then
  URL="(served by your reverse proxy -> http://127.0.0.1:$PORT)"
elif [ -n "$DOMAIN" ]; then
  log "Configuring Nginx + HTTPS for $DOMAIN"
  apt-get install -y nginx certbot python3-certbot-nginx
  cat >"/etc/nginx/sites-available/webide" <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
  ln -sf /etc/nginx/sites-available/webide /etc/nginx/sites-enabled/webide
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null
  fi
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
  URL="https://$DOMAIN"
else
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow "$PORT"/tcp >/dev/null
  fi
  IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  URL="http://$IP:$PORT"
fi

log "Waiting for the app to answer"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then OK=1; break; fi
  sleep 1
done
[ "${OK:-0}" = 1 ] || { journalctl -u webide -n 40 --no-pager; die "App did not start. Logs above."; }

# The sandbox route must carry its own CSP, otherwise preview isolation is broken.
curl -fsSI "http://127.0.0.1:$PORT/sandbox" | grep -qi '^content-security-policy: sandbox' \
  || die "/sandbox is missing the 'sandbox' CSP header; do not expose this deployment."

log "Done"
echo "Open:      $URL/editor/demo-project"
echo "Logs:      journalctl -u webide -f"
if [ "$LOCAL_ONLY" = 1 ]; then
  echo "Update:    sudo LOCAL_ONLY=1 PORT=$PORT bash $APP_DIR/deploy.sh"
elif [ -n "$DOMAIN" ]; then
  echo "Update:    sudo DOMAIN=$DOMAIN EMAIL=$EMAIL bash $APP_DIR/deploy.sh"
else
  echo "Update:    sudo PORT=$PORT bash $APP_DIR/deploy.sh"
fi
[ -z "$DOMAIN" ] && [ "$LOCAL_ONLY" != 1 ] && echo "Note: without a domain the site is plain HTTP; some browser features work best over HTTPS."
exit 0
