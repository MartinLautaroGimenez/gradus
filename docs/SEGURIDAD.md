# Seguridad

Gradus guarda datos de menores (notas, asistencia, convivencia, datos de
contacto de las familias), así que la seguridad es parte del diseño y no un
agregado. Este documento resume qué medidas hay, dónde están en el código y qué
tiene que hacer quien administra el servidor.

## Resumen

| Riesgo | Medida | Dónde |
|---|---|---|
| Adivinar contraseñas | Límite de intentos por cuenta (5 cada 15 min) y por IP (20 cada 15 min); tiempo de respuesta igual exista o no la cuenta | `src/app/login/actions.ts`, `src/lib/auth/rate-limit.ts` |
| Contraseñas débiles | Mínimo 10 caracteres; se rechazan las más usadas, secuencias y las que contienen el DNI, el nombre o el email | `src/lib/auth/password-policy.ts` |
| Contraseña inicial adivinable | Las cuentas nuevas reciben una contraseña al azar (`nube-mate-4827`) que se muestra una sola vez y se cambia en el primer ingreso. Ya no se usa el DNI | `src/lib/auth/initial-password.ts` |
| Robo de contraseña | Verificación en dos pasos (TOTP, compatible con Google/Microsoft Authenticator) con 8 códigos de recuperación de un solo uso. La escuela puede exigirla a dirección, administración y administradores | `src/lib/auth/totp.ts`, `src/lib/auth/two-factor.ts`, `/cuenta/seguridad` |
| Robo de la base de datos | Contraseñas con bcrypt; tokens de sesión, desafíos y códigos de recuperación guardados como hash; secretos de 2FA cifrados con AES-256-GCM y la clave `SECRET_KEY`, que no está en la base | `src/lib/secret-box.ts` |
| Robo de sesión | Cookie `HttpOnly`, `Secure`, `SameSite=Lax` y prefijo `__Host-` con HTTPS. Vence a los 30 días o tras 14 días sin uso. Cambiar la contraseña, activar 2FA, cambiar roles o desactivar la cuenta cierra las demás sesiones. Cada persona ve sus dispositivos y puede cerrarlos | `src/lib/auth/session.ts` |
| Inyección de código (XSS) | React escapa todo; no se usa `dangerouslySetInnerHTML`. Política de seguridad de contenido (CSP) con *nonce* por respuesta y `strict-dynamic`: el navegador sólo ejecuta los scripts que pone Gradus | `src/middleware.ts`, `src/lib/security-headers.ts` |
| Clickjacking | `frame-ancestors 'none'` y `X-Frame-Options: DENY` | `src/lib/security-headers.ts` |
| CSRF | Las server actions de Next sólo aceptan pedidos del mismo origen; la cookie es `SameSite=Lax` | Next.js |
| Ver datos ajenos | Cada página y cada server action vuelven a chequear permisos y filtran por lo que la persona puede ver; los ids que manda el navegador se verifican | `src/lib/auth/permissions.ts`, `src/lib/grading/permissions.ts`, `src/lib/scope.ts` |
| Archivos maliciosos | Extensiones permitidas, máximo 10 MB, y el contenido tiene que coincidir con la extensión (firma de bytes). Se guardan con nombre aleatorio fuera de la carpeta pública y se sirven con `nosniff` y CSP `sandbox` | `src/lib/storage.ts`, `src/lib/file-signature.ts`, `src/app/archivos/[id]/route.ts` |
| Fórmulas en planillas | Los CSV exportados anteponen `'` a textos que empiezan con `=`, `+`, `-` o `@` | `src/app/(app)/reportes/exportar/route.ts`, importación |
| Abuso | Límites a mensajes (30 por minuto), comunicados (10 cada 10 min) e importaciones | `src/lib/auth/rate-limit.ts` |
| Redirecciones abiertas | Los enlaces de las notificaciones sólo pueden ir a rutas internas | `src/app/notificaciones/ir/[id]/route.ts` |
| Dependencias vulnerables | `npm audit` sin vulnerabilidades; las dependencias indirectas con fallas se fuerzan a versiones corregidas (`overrides` en `package.json`) | `package.json` |
| Nadie sabe qué pasó | Registro de auditoría: ingresos (y fallidos), cambios de contraseña y 2FA, altas, roles, notas (valor anterior y nuevo), correcciones de asistencia, matrículas, convivencia, comunicados, importaciones y configuración | `src/lib/audit.ts`, `/configuracion/auditoria` |
| Indexación | `noindex` en todas las páginas | `src/app/layout.tsx`, encabezados |

## Encabezados HTTP

Todas las respuestas llevan:

- `Content-Security-Policy` con nonce (ver arriba). Estilos `unsafe-inline`
  porque Next y Tailwind los necesitan; no permiten ejecutar código.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (sólo con HTTPS).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` que apaga cámara, micrófono, ubicación, pagos, USB, etc.
- `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`.
- Sin `X-Powered-By`.

Para verificarlos: `curl -sI https://tu.dominio/login`.

## Verificación en dos pasos

- Cada persona la activa desde **Seguridad de la cuenta** (el escudo junto a su
  nombre): escanea el QR con la app, confirma con un código y guarda los 8
  códigos de recuperación.
- Un mismo código no sirve dos veces. El segundo paso del ingreso vence a los
  5 minutos y admite 5 intentos.
- **Exigirla:** en Configuración, "Exigir verificación en dos pasos a dirección,
  administración y administradores del sistema". Quien no la tenga es llevado a
  activarla antes de poder usar el sistema. Para marcarla, quien la marca tiene
  que tenerla activada (así no se queda afuera).
- **Si alguien pierde el teléfono y los códigos:** un directivo o el
  administrador la quita desde la ficha de la persona (Personas → Cuenta →
  "Quitar verificación en dos pasos"), después de verificar su identidad.
- Si se pierde `SECRET_KEY`, nadie puede completar el segundo paso: se puede
  recuperar el acceso con `npm run crear-admin` y quitar la verificación de
  cada persona.

## Contraseñas iniciales

- Al crear una persona, vincular un tutor nuevo o restablecer una contraseña,
  la pantalla muestra la contraseña generada **una sola vez**, con botón para
  copiarla.
- La importación masiva ofrece un CSV con las contraseñas de todas las cuentas
  creadas. Ese archivo es sensible: entregar cada contraseña a su dueño y
  borrarlo.
- Al primer ingreso se pide elegir una contraseña nueva que cumpla la política.

## Auditoría

`Configuración → Registro de auditoría` (administración del sistema y
dirección) muestra quién hizo qué, cuándo y desde qué IP, con filtros por tipo
y búsqueda. Los cambios de notas guardan el valor anterior y el nuevo de cada
celda. Además, cada persona ve su propia actividad reciente en Seguridad de la
cuenta, para detectar ingresos que no reconoce.

El registro no se borra desde la aplicación. Para conservarlo acotado se puede
borrar lo viejo directamente en la base, por ejemplo una vez por año:

```sql
DELETE FROM "AuditLog" WHERE "createdAt" < now() - interval '3 years';
```

## Servidor

El instalador (`scripts/instalar.sh`) ya deja:

- Usuario de sistema `gradus` sin shell; `.env` con permisos `600`; adjuntos
  con permisos `640`.
- `SECRET_KEY` y contraseña de la base generadas al azar.
- Servicio systemd aislado: sistema de archivos de sólo lectura salvo los datos,
  sin privilegios, sin acceso a dispositivos ni al kernel, sólo red IPv4/IPv6.
  Si el contenedor no soporta el aislamiento extra, se usa uno básico.
- Con `DOMINIO`: Caddy con HTTPS automático delante y la aplicación escuchando
  sólo en `127.0.0.1`.
- PostgreSQL escuchando sólo en `localhost`.
- Copia de seguridad diaria a `/var/backups/gradus` (base, adjuntos y `.env`,
  14 días, permisos `600`).

Opcionales del instalador:

```bash
sudo FIREWALL=1 ACTUALIZACIONES=1 DOMINIO=gradus.ejemplo.com bash scripts/instalar.sh
```

- `FIREWALL=1`: ufw sólo deja pasar SSH y la web.
- `ACTUALIZACIONES=1`: actualizaciones de seguridad automáticas de Debian/Ubuntu.

### Lista para quien administra

- [ ] Usar HTTPS (`DOMINIO=...`). `COOKIE_SECURE=false` es sólo para pruebas.
- [ ] Activar la verificación en dos pasos en la cuenta de administrador y
      exigirla al personal.
- [ ] Copiar `/var/backups/gradus` **fuera del servidor** (otro equipo, disco o
      nube). Probar una restauración de vez en cuando:
      `pg_restore --clean -d gradus gradus-db-FECHA.dump`.
- [ ] Guardar `SECRET_KEY` en un lugar seguro aparte (está en el backup del `.env`).
- [ ] SSH sólo con clave, sin contraseña ni acceso directo de root.
- [ ] Actualizar Gradus seguido (`git pull` + instalador) y revisar `npm audit`.
- [ ] Revisar de vez en cuando el registro de auditoría (ingresos fallidos,
      cambios de notas en períodos cerrados, cambios de roles).

## Límites conocidos

- Los límites de intentos se guardan en memoria: con un solo servidor alcanza;
  se reinician si el servicio se reinicia.
- La IP se toma de `X-Forwarded-For`, que pone Caddy. Si Gradus se expone sin
  proxy, ese encabezado lo podría inventar quien se conecta: por eso los
  límites también se aplican por cuenta, que no depende de la IP.
- Los PDF se abren en el visor del navegador sin `sandbox` (el visor de Chrome
  no funciona con él); su contenido igual se valida al subirlos.
