# Gradus

Sistema de gestión escolar: notas, asistencia, comunicados, convivencia y
comunicación directa entre la escuela y las familias. Pensado primero para el
nivel secundario de la ETec (Universidad de Mendoza).

**Módulos:** notas (planilla tipo Excel), asistencia, comunicados con
seguimiento de lectura, notificaciones (bandeja, push y email), mensajería,
convivencia, calendario, autorizaciones, reportes, y la administración de
ciclos, cursos, materias y personas (con importación desde Excel).

- **Alcance, módulos y hoja de ruta:** [`docs/ALCANCE.md`](docs/ALCANCE.md)
- **Instalación en un servidor (homelab / ETec):** [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind CSS 4 · Vitest.
Web responsive instalable como PWA.

## Desarrollo local

Requisitos: Node.js 22+ y PostgreSQL 14+.

```bash
# 1. Crear la base (una sola vez)
sudo -u postgres psql -c "CREATE USER gradus WITH PASSWORD 'gradus' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE gradus OWNER gradus;"

# 2. Configurar e instalar
cp .env.example .env
npm install

# 3. Crear tablas y cargar datos de prueba
npm run db:migrate
npm run db:seed

# 4. Levantar
npm run dev
```

Para probar las notificaciones push en local: `npm run push:keys` y copiar las
claves a `.env` (ver `.env.example`).

Abrir http://localhost:3000.

### Usuarios de prueba

Todos con contraseña `gradus123`. También se puede ingresar con el DNI.
Las cuentas que se creen desde la aplicación usan el DNI como contraseña
inicial y piden cambiarla en el primer ingreso.

| Email | Rol |
|---|---|
| `admin@gradus.local` | Administrador del sistema |
| `directora@gradus.local` | Directivo |
| `administracion@gradus.local` | Administrativo |
| `preceptor@gradus.local` | Preceptor (1° A, 1° B, 4° A) |
| `docente@gradus.local` | Docente |
| `acabrera@gradus.local` | Docente y madre de un alumno (varios roles) |
| `familia@gradus.local` | Familia con dos hijos en cursos distintos |
| `tutor1@gradus.local` … `tutor20@gradus.local` | Familias del resto de los alumnos |
| `alumno@gradus.local`, `alumno1@gradus.local` … | Alumnos (`alumno@` es de 1° A) |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar y correr en modo producción |
| `npm run lint` · `npm run typecheck` · `npm test` | Controles de calidad |
| `npm run db:migrate` | Crear una migración a partir de cambios en `prisma/schema.prisma` |
| `npm run db:deploy` | Aplicar migraciones en un servidor |
| `npm run db:seed` | **Borra** la base y carga datos de prueba |
| `npm run db:studio` | Explorador visual de la base |

## Estructura

```
prisma/            esquema, migraciones y datos de prueba
src/app/login      inicio de sesión
src/app/(app)      páginas privadas (requieren sesión)
src/components     componentes de interfaz
src/lib            lógica: auth, permisos, cálculo de notas y asistencia,
                   notificaciones, reportes
docs/              documentación del proyecto
```
