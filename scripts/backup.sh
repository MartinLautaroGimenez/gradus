#!/usr/bin/env bash
# Copia de seguridad de Gradus: base de datos + adjuntos.
# La instala scripts/instalar.sh como tarea diaria (gradus-backup.timer).
# Uso manual: sudo bash /opt/gradus/scripts/backup.sh
#
# Variables opcionales:
#   DESTINO=/var/backups/gradus   carpeta de las copias
#   DIAS=14                       cuántos días se conservan
set -euo pipefail

DESTINO="${DESTINO:-/var/backups/gradus}"
DIAS="${DIAS:-14}"
DATOS=/var/lib/gradus
FECHA="$(date +%F_%H%M)"

[[ $EUID -eq 0 ]] || { echo "Corré el backup como root." >&2; exit 1; }
umask 077
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

# Base de datos en formato comprimido de pg_dump (se restaura con pg_restore).
runuser -u postgres -- pg_dump --format=custom --no-owner gradus > "$DESTINO/gradus-db-$FECHA.dump"
# Adjuntos de comunicados.
if [[ -d "$DATOS/storage" ]]; then
  tar -C "$DATOS" -czf "$DESTINO/gradus-archivos-$FECHA.tar.gz" storage
fi
# Configuración (tiene contraseñas y claves: sin ella no se pueden leer los secretos de 2FA).
if [[ -f /opt/gradus/.env ]]; then cp /opt/gradus/.env "$DESTINO/gradus-env-$FECHA"; fi

# Rotación.
find "$DESTINO" -maxdepth 1 -type f -name 'gradus-*' -mtime "+$DIAS" -delete

echo "Backup listo en $DESTINO ($FECHA)"
