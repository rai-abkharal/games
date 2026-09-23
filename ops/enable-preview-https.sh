#!/bin/bash
# Run from the checked-out Git revision; never print the private service environment.
set -euo pipefail
export PATH="/opt/games-node/bin:$PATH"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PREVIEW_HOST=preview.187.77.147.226.sslip.io
ENV_FILE=/etc/games-admin.env
SITE=/etc/nginx/sites-available/games-preview
LINK=/etc/nginx/sites-enabled/games-preview
test "$(id -u)" = 0
test -f "$ENV_FILE"
BACKUP="$(mktemp -d /var/backups/games-preview-https.XXXXXX)"
cp -a "$ENV_FILE" "$BACKUP/games-admin.env"
if [ -f "$SITE" ]; then cp -a "$SITE" "$BACKUP/site"; fi
if [ -e "$LINK" ]; then cp -a "$LINK" "$BACKUP/link"; fi
ENV_CHANGED=false
rollback() {
    trap - ERR
    if [ -f "$BACKUP/site" ]; then cp -a "$BACKUP/site" "$SITE"; else rm -f -- "$SITE"; fi
    if [ -L "$BACKUP/link" ] || [ -f "$BACKUP/link" ]; then
        cp -a "$BACKUP/link" "$LINK"
    else
        rm -f -- "$LINK"
    fi
    cp -a "$BACKUP/games-admin.env" "$ENV_FILE"
    nginx -t && systemctl reload nginx
    if [ "$ENV_CHANGED" = true ]; then
        set -a
        source "$ENV_FILE"
        set +a
        pm2 restart mini-games-backend --update-env
    fi
    echo "Preview setup failed; previous config restored. Backup: $BACKUP" >&2
    exit 1
}
trap rollback ERR
install -d -m 755 /var/lib/games-preview-acme
install -m 644 "$SCRIPT_DIR/preview-http.conf" "$SITE"
ln -sfn "$SITE" "$LINK"
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/lib/games-preview-acme -d "$PREVIEW_HOST" --non-interactive --keep-until-expiring
cat "$SCRIPT_DIR/preview-http.conf" "$SCRIPT_DIR/preview-https.conf" > "$SITE"
nginx -t
systemctl reload nginx
# Verify the certificate without bypassing TLS verification before switching the app.
curl --fail --silent --show-error --max-time 20 "https://$PREVIEW_HOST/api/games" -o /dev/null
node - "$ENV_FILE" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
let env = fs.readFileSync(file, 'utf8');
const setting = 'PREVIEW_ORIGIN=https://preview.187.77.147.226.sslip.io';
env = /^PREVIEW_ORIGIN=.*$/m.test(env)
  ? env.replace(/^PREVIEW_ORIGIN=.*$/m, setting)
  : env + '\n' + setting + '\n';
fs.writeFileSync(file, env);
NODE
ENV_CHANGED=true
set -a
source "$ENV_FILE"
set +a
pm2 restart mini-games-backend --update-env
curl --fail --silent --show-error --retry 5 --retry-connrefused --retry-delay 1 --max-time 20 \
    "https://$PREVIEW_HOST/games/water-sort-3d/1.0.0/index.html" -o /dev/null
install -m 755 "$SCRIPT_DIR/renew-preview-certificate.sh" /etc/letsencrypt/renewal-hooks/deploy/games-preview-nginx
echo "HTTPS preview configured. Rollback backup: $BACKUP"
