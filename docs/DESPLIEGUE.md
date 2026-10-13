# Despliegue

Gradus corre como una aplicación Node.js común detrás de un proxy inverso,
sin Docker. Esto sirve tanto para el homelab (fase de prueba) como para el
servidor de la ETec.

## Requisitos

- Linux con Node.js 22+ y PostgreSQL 14+
- Un proxy inverso con HTTPS (Caddy, Nginx o Traefik)

## Pasos

```bash
git clone https://github.com/MartinLautaroGimenez/gradus.git
cd gradus
cp .env.example .env      # completar DATABASE_URL con un usuario y contraseña reales
npm ci
npm run db:deploy         # aplica migraciones (no borra datos)
npm run build
PORT=3000 npm start
```

> No correr `npm run db:seed` en un servidor con datos reales: borra todo.

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

[Install]
WantedBy=multi-user.target
```

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

Programar un `pg_dump` diario y guardar copias fuera del servidor:

```bash
pg_dump -Fc gradus > /backups/gradus-$(date +%F).dump
```
