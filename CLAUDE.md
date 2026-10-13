# Gradus: notas para trabajar en el repo

- Interfaz, documentación y commits en **español**; código (nombres de variables, modelos, funciones) en **inglés**.
- Alcance, roles y hoja de ruta: `docs/ALCANCE.md`. Actualizar la tabla de módulos al terminar una etapa.
- Toda cuenta con notas pasa por `src/lib/grades.ts` y tiene que tener tests en `src/lib/grades.test.ts`.
- Páginas privadas van dentro de `src/app/(app)/` y obtienen el usuario con `requireUser()` o `requireRole()` de `src/lib/auth/session.ts`. El middleware sólo chequea que exista la cookie.
- Cada consulta tiene que filtrar por lo que el usuario puede ver (sus cursos, sus hijos, sus materias); nunca confiar en ids que vienen del cliente sin verificarlos.
- Cambios en la base: editar `prisma/schema.prisma` y correr `npm run db:migrate -- --name <nombre>`. Actualizar `prisma/seed.ts` si hace falta.
- Antes de commitear: `npm run lint && npm run typecheck && npm test && npm run build`.
- Colores: usar los tokens de `src/app/globals.css` (`bg-surface`, `text-muted`, `bg-primary`…), no colores sueltos de Tailwind; así funciona el modo oscuro.
- Formularios con server actions: usar `useFormAction` (`src/lib/use-form-action.ts`) en vez de `useActionState` + `action={...}`, porque React 19 vacía el formulario después de cada envío y se pierden los datos cuando hay un error de validación. Pasar `pending` a `SubmitButton`.
- Permisos sobre personas: `src/lib/auth/permissions.ts` (`canManageUser`, `assignableRoles`). Toda server action vuelve a chequear permisos aunque la página ya lo haya hecho.
- Notas: la planilla (`src/app/(app)/notas/[id]/grade-sheet.tsx`) calcula en vivo con `src/lib/grades.ts`; el servidor (`src/lib/grading/results.ts`) usa las mismas funciones. No duplicar fórmulas.
- Permisos de notas: `src/lib/grading/permissions.ts`. `saveGrades` revalida cada celda (evaluación de la planilla, alumno activo del curso, período abierto).
