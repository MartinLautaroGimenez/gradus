#!/usr/bin/env bash
# Instala o actualiza Gradus en un servidor Debian/Ubuntu (también un LXC de Proxmox).
# Se puede correr las veces que haga falta: la primera vez instala, después actualiza.
#
# Uso (como root):
#   bash instalar.sh                         # acceso por la red local, http://IP:3000
#   DOMINIO=gradus.ejemplo.com bash instalar.sh   # con HTTPS automático (Caddy)
#
# Variables opcionales:
#   RAMA=main          rama del repositorio a instalar
#   DEMO=1             carga los datos de prueba (sólo si la base está vacía)
#   PUERTO=3000        puerto interno de la aplicación

set -euo pipefail

REPO="${REPO:-https://github.com/MartinLautaroGimenez/gradus.git}"
RAMA="${RAMA:-main}"
DOMINIO="${DOMINIO:-}"
PUERTO="${PUERTO:-3000}"
DEMO="${DEMO:-0}"
DIR=/opt/gradus
DATOS=/var/lib/gradus
USUARIO=gradus

paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
error() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }
# Corre un comando como el usuario gradus, con su propio HOME (caché de npm, config de git).
como_gradus() { runuser -u "$USUARIO" -- env HOME="$DATOS" bash -c "cd '$DIR' && $*"; }

[[ $EUID -eq 0 ]] || error "Corré el script como root (por ejemplo: sudo bash instalar.sh)."
command -v apt-get >/dev/null || error "Este script es para Debian/Ubuntu (necesita apt-get)."

# ── Paquetes del sistema ─────────────────────────────────────
paso "Instalando paquetes del sistema (git, PostgreSQL)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl postgresql >/dev/null

node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if (( $(node_major) < 22 )); then
  paso "Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

# ── Usuario y código ─────────────────────────────────────────
if ! id "$USUARIO" >/dev/null 2>&1; then
  paso "Creando el usuario del sistema '$USUARIO'"
  useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$USUARIO"
fi

mkdir -p "$DATOS/storage"
chown -R "$USUARIO:$USUARIO" "$DATOS"
chmod 750 "$DATOS"

if [[ -d "$DIR/.git" ]]; then
  paso "Actualizando el código (rama $RAMA)"
  como_gradus "git fetch --quiet origin '$RAMA' && git checkout --quiet '$RAMA' && git merge --quiet --ff-only 'origin/$RAMA'" \
    || error "No se pudo actualizar: ¿hay cambios hechos a mano en $DIR?"
else
  paso "Descargando el código (rama $RAMA)"
  mkdir -p "$DIR"
  chown "$USUARIO:$USUARIO" "$DIR"
  runuser -u "$USUARIO" -- env HOME="$DATOS" git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi

# ── Base de datos ────────────────────────────────────────────
paso "Configurando PostgreSQL"
systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start >/dev/null
psql_admin() { runuser -u postgres -- psql -qAt "$@"; }
ENV_FILE="$DIR/.env"
DB_PASS=""
if [[ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='gradus'")" != "1" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
  psql_admin -c "CREATE ROLE gradus LOGIN PASSWORD '$DB_PASS'"
elif [[ ! -f "$ENV_FILE" ]]; then
  # El usuario de la base existe pero se perdió el .env: se le pone una contraseña nueva.
  DB_PASS="$(openssl rand -hex 24)"
  psql_admin -c "ALTER ROLE gradus PASSWORD '$DB_PASS'"
fi
if [[ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='gradus'")" != "1" ]]; then
  psql_admin -c "CREATE DATABASE gradus OWNER gradus"
fi

# ── Dependencias ─────────────────────────────────────────────
paso "Instalando dependencias de la aplicación (puede tardar unos minutos)"
como_gradus "npm ci --no-audit --no-fund --loglevel=error"

# ── Configuración (.env) ─────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  paso "Generando la configuración ($ENV_FILE)"
  IP="$(hostname -I | awk '{print $1}')"
  if [[ -n "$DOMINIO" ]]; then APP_URL="https://$DOMINIO"; else APP_URL="http://$IP:$PUERTO"; fi
  VAPID="$(como_gradus "npx --no-install web-push generate-vapid-keys --json 2>/dev/null")"
  VAPID_PUBLIC="$(node -p "JSON.parse(process.argv[1]).publicKey" "$VAPID")"
  VAPID_PRIVATE="$(node -p "JSON.parse(process.argv[1]).privateKey" "$VAPID")"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Generado por scripts/instalar.sh el $(date +%F). No compartir: tiene contraseñas.
DATABASE_URL="postgresql://gradus:${DB_PASS}@localhost:5432/gradus?schema=public"
APP_URL="${APP_URL}"
STORAGE_DIR="${DATOS}/storage"

# Notificaciones push. No cambiar estas claves: si cambian, todos tienen que volver a activarlas.
VAPID_PUBLIC_KEY="${VAPID_PUBLIC}"
VAPID_PRIVATE_KEY="${VAPID_PRIVATE}"
VAPID_SUBJECT="mailto:admin@${DOMINIO:-localhost}"

# Email (opcional). Ejemplo: smtps://usuario:clave@smtp.gmail.com:465
# SMTP_URL=""
# MAIL_FROM="Gradus <no-responder@ejemplo.com>"
EOF
  if [[ -z "$DOMINIO" ]]; then
    cat >> "$ENV_FILE" <<'EOF'

# Sin HTTPS (prueba en la red local). Quitar cuando se use un dominio con HTTPS.
COOKIE_SECURE=false
EOF
  fi
  umask 022
  chown "$USUARIO:$USUARIO" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
elif [[ -n "$DB_PASS" ]]; then
  error "Estado inesperado: existe $ENV_FILE pero se cambió la contraseña de la base."
elif [[ -n "$DOMINIO" ]] && ! grep -q "^APP_URL=\"https://$DOMINIO\"" "$ENV_FILE"; then
  # Se agregó un dominio después de instalar: pasa a HTTPS.
  paso "Pasando la configuración a https://$DOMINIO"
  sed -i "s|^APP_URL=.*|APP_URL=\"https://$DOMINIO\"|; /^COOKIE_SECURE=/d; /^# Sin HTTPS/d" "$ENV_FILE"
fi

# ── Migraciones y compilación ────────────────────────────────
paso "Actualizando la base de datos"
como_gradus "npx --no-install prisma migrate deploy"

if [[ "$DEMO" == "1" ]]; then
  if [[ "$(runuser -u postgres -- psql -qAt -d gradus -c 'SELECT count(*) FROM "User"')" == "0" ]]; then
    paso "Cargando datos de prueba"
    como_gradus "npm run db:seed"
  else
    aviso "La base ya tiene usuarios: no se cargan datos de prueba (borrarían todo)."
  fi
fi

paso "Compilando la aplicación"
como_gradus "npm run build >/dev/null"

# ── Servicio ─────────────────────────────────────────────────
paso "Instalando el servicio 'gradus'"
if [[ -n "$DOMINIO" ]]; then HOST=127.0.0.1; else HOST=0.0.0.0; fi
cat > /etc/systemd/system/gradus.service <<EOF
[Unit]
Description=Gradus
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${USUARIO}
WorkingDirectory=${DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
ExecStart=${DIR}/node_modules/.bin/next start -H ${HOST} -p ${PUERTO}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

if [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable gradus >/dev/null 2>&1
  systemctl restart gradus
else
  aviso "Este sistema no usa systemd: iniciá Gradus a mano con"
  echo "  cd $DIR && sudo -u $USUARIO env NODE_ENV=production node_modules/.bin/next start -H $HOST -p $PUERTO"
  echo "(Next lee la configuración de $ENV_FILE)."
  exit 0
fi

# ── HTTPS con Caddy (sólo si hay dominio) ────────────────────
if [[ -n "$DOMINIO" ]]; then
  paso "Configurando HTTPS para $DOMINIO (Caddy)"
  apt-get install -y -qq caddy >/dev/null || error "No se pudo instalar Caddy. Ver https://caddyserver.com/docs/install"
  if ! grep -q "^$DOMINIO " /etc/caddy/Caddyfile 2>/dev/null; then
    cat >> /etc/caddy/Caddyfile <<EOF

$DOMINIO {
	encode gzip
	reverse_proxy 127.0.0.1:${PUERTO}
}
EOF
  fi
  systemctl reload caddy || systemctl restart caddy
fi

# ── Verificación ─────────────────────────────────────────────
paso "Verificando"
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:${PUERTO}/login"; then OK=1; break; fi
  sleep 1
done
[[ "${OK:-0}" == "1" ]] || error "Gradus no respondió. Revisá los registros con: journalctl -u gradus -n 50"

URL="$(grep '^APP_URL=' "$ENV_FILE" | cut -d'"' -f2)"
ADMINS="$(runuser -u postgres -- psql -qAt -d gradus -c "SELECT count(*) FROM \"User\" WHERE 'SUPERADMIN' = ANY(roles)")"
if [[ "$ADMINS" == "0" ]]; then
  if [[ -t 0 ]]; then
    paso "Creá el primer administrador"
    como_gradus "npm run -s crear-admin"
  else
    aviso "Todavía no hay administrador. Crealo con: cd $DIR && sudo -u $USUARIO npm run crear-admin"
  fi
fi

printf '\n\033[1;32mGradus está funcionando en %s\033[0m\n' "$URL"
echo "  · Registros:   journalctl -u gradus -f"
echo "  · Actualizar:  sudo RAMA=$RAMA bash $DIR/scripts/instalar.sh"
echo "  · Backup:      ver docs/DESPLIEGUE.md (base de datos y $DATOS/storage)"
if [[ -z "$DOMINIO" ]]; then
  aviso "Sin HTTPS las notificaciones push no funcionan. Para activarlas, volvé a correr el script con DOMINIO=tu.dominio"
fi
