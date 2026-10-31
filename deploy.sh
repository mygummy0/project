#!/usr/bin/env bash
# Deploys the Web IDE on Ubuntu (20.04+). Run as root (or with sudo). Safe to re-run: it updates and restarts.
#
#   sudo bash deploy.sh                                   # http://SERVER_IP:3000
#   sudo DOMAIN=ide.example.com EMAIL=me@example.com bash deploy.sh   # Nginx + HTTPS (Let's Encrypt)
#
#   sudo LOCAL_ONLY=1 PORT=3000 bash deploy.sh           # behind an existing reverse proxy (Caddy, Nginx…):
#                                                         # listens on 127.0.0.1 only, opens no firewall port
#
# Web terminal (a real shell in the browser, password protected, see services/terminal-server):
#   sudo LOCAL_ONLY=1 ENABLE_TERMINAL=1 TERMINAL_ORIGIN=https://example.com bash deploy.sh
#   then:  sudo node /opt/webide/services/terminal-server/src/set-password.mjs      (choose the password)
#          sudo systemctl restart webide-terminal
#   and route /terminal/* to 127.0.0.1:3001 in your reverse proxy (see README).
#
# Optional variables: PORT (3000), BRANCH, REPO_URL, APP_DIR (/opt/webide), LOCAL_ONLY (0),
#   ENABLE_TERMINAL (0), TERMINAL_ORIGIN (https://$DOMAIN), TERMINAL_USER (the sudo-invoking user), TERMINAL_PORT (3001)
set -euo pipefail

PORT="${PORT:-3000}"
BRANCH="${BRANCH:-claude/web-ide-engine-5iccld}"
REPO_URL="${REPO_URL:-https://github.com/mygummy0/project.git}"
APP_DIR="${APP_DIR:-/opt/webide}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
LOCAL_ONLY="${LOCAL_ONLY:-0}"
ENABLE_TERMINAL="${ENABLE_TERMINAL:-0}"
TERMINAL_PORT="${TERMINAL_PORT:-3001}"
TERMINAL_USER="${TERMINAL_USER:-${SUDO_USER:-ubuntu}}"
TERMINAL_ORIGIN="${TERMINAL_ORIGIN:-${DOMAIN:+https://$DOMAIN}}"
APP_USER="webide"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash deploy.sh"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || echo "Warning: tested for Ubuntu only (detected: ${ID:-unknown})."
[ -z "$DOMAIN" ] || [ -n "$EMAIL" ] || die "DOMAIN requires EMAIL (used for Let's Encrypt expiry notices)."
if [ "$ENABLE_TERMINAL" = 1 ]; then
  [ -n "$TERMINAL_ORIGIN" ] || die "ENABLE_TERMINAL=1 needs TERMINAL_ORIGIN, e.g. TERMINAL_ORIGIN=https://example.com (the exact site address in the browser)."
  case "$TERMINAL_ORIGIN" in http://*|https://*) ;; *) die "TERMINAL_ORIGIN must start with https:// (or http://)";; esac
  id "$TERMINAL_USER" >/dev/null 2>&1 || die "TERMINAL_USER '$TERMINAL_USER' does not exist. Set TERMINAL_USER=<your login name>."
  [ "$TERMINAL_USER" != root ] || die "Refusing to run the web terminal as root. Use your normal login (it can still use sudo)."
fi

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg
# node-pty (web terminal) is a native module and is compiled on install.
[ "$ENABLE_TERMINAL" != 1 ] || apt-get install -y build-essential python3 make g++

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
TERMINAL_PUBLIC_URL=""
[ "$ENABLE_TERMINAL" != 1 ] || TERMINAL_PUBLIC_URL="/terminal"
runuser -u "$APP_USER" -- env NEXT_PUBLIC_TERMINAL_URL="$TERMINAL_PUBLIC_URL" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

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


if [ "$ENABLE_TERMINAL" = 1 ]; then
  log "Setting up the web terminal (runs as '$TERMINAL_USER', listens on 127.0.0.1:$TERMINAL_PORT only)"
  mkdir -p /etc/webide
  ENV_FILE=/etc/webide/terminal.env
  if [ ! -f "$ENV_FILE" ]; then
    printf 'TERMINAL_SECRET=%s\n' "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >"$ENV_FILE"
  fi
  # Keep these settings in sync with the current run; the secret and password hash are preserved.
  TERMINAL_HOME="$(getent passwd "$TERMINAL_USER" | cut -d: -f6)"
  for kv in "HOST=127.0.0.1" "PORT=$TERMINAL_PORT" "BASE_PATH=/terminal" "ALLOWED_ORIGINS=$TERMINAL_ORIGIN" "TERMINAL_CWD=$TERMINAL_HOME"; do
    key="${kv%%=*}"
    grep -v "^$key=" "$ENV_FILE" >"$ENV_FILE.tmp" || true
    printf '%s\n' "$kv" >>"$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  done
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  cat >/etc/systemd/system/webide-terminal.service <<UNIT
[Unit]
Description=Web IDE terminal server (password protected shell)
After=network.target

[Service]
Type=simple
User=$TERMINAL_USER
WorkingDirectory=$APP_DIR/services/terminal-server
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) src/server.mjs
Restart=on-failure
RestartSec=3
# No NoNewPrivileges/ProtectSystem on purpose: the shell must be able to use sudo like a normal login.

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable webide-terminal >/dev/null
  systemctl restart webide-terminal
  if ! grep -q '^TERMINAL_PASSWORD_HASH=' "$ENV_FILE"; then
    printf '\n\033[1;33m!! No terminal password is set yet, so nobody can log in. Set it now:\n   sudo node %s/services/terminal-server/src/set-password.mjs\n   sudo systemctl restart webide-terminal\033[0m\n' "$APP_DIR"
  fi
elif systemctl is-active --quiet webide-terminal 2>/dev/null; then
  echo "Note: webide-terminal is still running although ENABLE_TERMINAL is off. Stop it with: sudo systemctl disable --now webide-terminal"
fi

if [ "$LOCAL_ONLY" = 1 ] && [ -z "$DOMAIN" ]; then
  URL="(served by your reverse proxy -> http://127.0.0.1:$PORT)"
  [ "$ENABLE_TERMINAL" != 1 ] || echo "Reverse proxy: route /terminal/* to 127.0.0.1:$TERMINAL_PORT (prefix stripped) and keep WebSocket upgrades enabled."
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
$(if [ "$ENABLE_TERMINAL" = 1 ]; then cat <<NGX
  location /terminal/ {
    proxy_pass http://127.0.0.1:$TERMINAL_PORT/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
NGX
fi)
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
