# Despliegue

Gradus corre como una aplicación Node.js común detrás de un proxy inverso,
sin Docker. Esto sirve tanto para el homelab (fase de prueba) como para el
servidor de la ETec.

## Requisitos

- Linux con Node.js 22+ y PostgreSQL 14+
- Un proxy inverso con HTTPS (Caddy, Nginx o Traefik)

## Instalación automática (recomendada)

En un servidor Debian/Ubuntu (o un contenedor LXC de Proxmox con Debian). Como
el repositorio es privado, primero lo clonás con tu cuenta de GitHub (usuario
y un token personal, o una clave SSH) y el script toma el código de esa copia:
el servidor nunca guarda credenciales de GitHub.

```bash
git clone https://github.com/MartinLautaroGimenez/gradus.git
cd gradus
sudo bash scripts/instalar.sh
```

El script instala PostgreSQL y Node 22, copia Gradus a `/opt/gradus`,
genera el `.env` con contraseñas y claves nuevas, aplica las migraciones,
compila, deja el servicio `gradus` andando y pide los datos del primer
administrador. Queda accesible en `http://IP-DEL-SERVIDOR:3000`.

Opciones (se pasan como variables antes del comando):

| Variable | Para qué |
|---|---|
| `DOMINIO=gradus.ejemplo.com` | Instala Caddy y sirve Gradus por HTTPS con certificado automático (el dominio tiene que apuntar al servidor y los puertos 80/443 tienen que llegarle) |
| `RAMA=nombre-de-rama` | Instalar otra rama (por defecto, la que tenga tu copia) |
| `DEMO=1` | Cargar los datos de prueba (sólo si la base está vacía) |
| `FIREWALL=1` | Activa el firewall (ufw): sólo quedan abiertos SSH y la web |
| `ACTUALIZACIONES=1` | Actualizaciones de seguridad automáticas del sistema |
| `BACKUP=0` | No programar la copia de seguridad diaria (por defecto se programa) |

Para **actualizar**: `git pull` en tu copia y `sudo bash scripts/instalar.sh`
otra vez. Trae el código nuevo, aplica migraciones, recompila y reinicia. No
toca el `.env` ni los datos.

Otro administrador (o recuperar el acceso): `cd /opt/gradus && sudo -u gradus HOME=/var/lib/gradus npm run crear-admin`.

## Instalación manual

```bash
git clone https://github.com/MartinLautaroGimenez/gradus.git
cd gradus
cp .env.example .env      # completar DATABASE_URL con un usuario y contraseña reales
npm ci
npm run db:deploy         # aplica migraciones (no borra datos)
npm run build
PORT=3000 npm start
npm run crear-admin       # primer administrador
```

> No correr `npm run db:seed` en un servidor con datos reales: borra todo.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (obligatoria) |
| `APP_URL` | URL pública, para los enlaces de los emails |
| `STORAGE_DIR` | Carpeta de adjuntos (por defecto `./storage`). Usar una ruta absoluta e incluirla en el backup |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificaciones push. Generar una vez con `npm run push:keys` y no cambiarlas (si cambian, cada persona tiene que volver a activar las notificaciones) |
| `SMTP_URL`, `MAIL_FROM` | Envío de emails (opcional). Ej.: `smtps://usuario:clave@smtp.gmail.com:465` |
| `SECRET_KEY` | Obligatoria en producción. Cifra los secretos de la verificación en dos pasos. Generar con `openssl rand -base64 48`, no cambiarla ni perderla (el instalador la genera) |
| `COOKIE_SECURE=false` | Sólo para probar por HTTP en la red local |

Las notificaciones push necesitan HTTPS. En iPhone sólo funcionan si la persona
agregó Gradus a la pantalla de inicio y lo abre desde ahí.

## Servicio systemd

`/etc/systemd/system/gradus.service`:

```ini
[Unit]
Description=Gradus
After=network.target postgresql.service

[Service]
Type=simple
User=gradus
WorkingDirectory=/opt/gradus
EnvironmentFile=/opt/gradus/.env
Environment=NODE_ENV=production PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/gradus /opt/gradus/.next
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

El instalador agrega más aislamiento en `gradus.service.d/endurecido.conf`
(ver `docs/SEGURIDAD.md`).

```bash
sudo systemctl enable --now gradus
```

## HTTPS

En producción la cookie de sesión es `Secure`, así que el sitio **tiene que**
servirse por HTTPS. Ejemplo con Caddy (obtiene el certificado solo):

```
gradus.ejemplo.com {
  reverse_proxy localhost:3000
}
```

Para probar en la red local por HTTP, agregar `COOKIE_SECURE=false` al `.env`.
No usarlo nunca con datos reales.

## Actualizar

```bash
git pull
npm ci
npm run db:deploy
npm run build
sudo systemctl restart gradus
```

## Backups

El instalador programa `scripts/backup.sh` todos los días a las 3:30
(`gradus-backup.timer`): base de datos, adjuntos y `.env` en
`/var/backups/gradus`, con 14 días de historia y permisos sólo para root.
Para correrlo a mano: `sudo bash /opt/gradus/scripts/backup.sh`.

**Copiá esa carpeta fuera del servidor** (otro equipo, disco o nube): un backup
en el mismo disco no sirve si el disco se rompe.

Restaurar:

```bash
sudo -u postgres pg_restore --clean --if-exists -d gradus /var/backups/gradus/gradus-db-FECHA.dump
sudo tar -C /var/lib/gradus -xzf /var/backups/gradus/gradus-archivos-FECHA.tar.gz
```

Sin instalador, el equivalente es:

```bash
pg_dump -Fc gradus > /backups/gradus-$(date +%F).dump
tar czf /backups/gradus-storage-$(date +%F).tgz -C /var/lib/gradus storage
```
