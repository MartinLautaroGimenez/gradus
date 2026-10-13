# Gradus: alcance del proyecto

## Qué es

Una plataforma escolar al estilo de GEI o Colegium, para que directivos,
preceptores, docentes, administrativos, familias y alumnos manejen en un
mismo lugar las notas, la asistencia, los comunicados, la convivencia y la
comunicación entre ellos.

- **Institución:** ETec, Universidad de Mendoza (Mendoza, Argentina)
- **Etapa inicial:** nivel secundario y una sola escuela. El modelo de datos
  ya contempla los niveles inicial, primario y terciario para sumarlos después.
- **Plataforma:** web responsive instalable como PWA (se agrega a la pantalla
  de inicio del celular y recibe notificaciones).
- **Infraestructura:** servidor propio de la ETec; en la fase de prueba, un
  homelab. Ver [`DESPLIEGUE.md`](DESPLIEGUE.md).

## Qué problemas resolvemos

Los sistemas actuales tienen fallas que los usuarios notan todos los días.
Cada una se convierte en una regla de diseño:

| Problema actual | Cómo lo encara Gradus |
|---|---|
| Los promedios no dan bien | Toda cuenta pasa por un único módulo con tests automáticos (`src/lib/grades.ts`). Se calcula con enteros, sin errores de punto flotante, y con reglas de redondeo escritas (ver abajo). |
| Las notas cargadas no aparecen | Una nota guardada es visible al instante para quien corresponda. Si hay una publicación diferida (por ejemplo, al cierre del cuatrimestre), la pantalla lo dice explícitamente en vez de mostrar un vacío. |
| No llegan las notificaciones | Cada aviso queda registrado con su estado (enviado, entregado, leído). Si el push falla, el aviso sigue en la bandeja dentro de la app y se puede reenviar por email. |
| Lento e incómodo en el celular | Diseño pensado primero para el celular, páginas livianas e instalación como app. |

### Reglas de cálculo de promedios

1. Escala de 1 a 10. Se aprueba con **7** (configurable en Configuración).
2. Promedio de un período = promedio ponderado de sus evaluaciones (los pesos
   son opcionales y por defecto valen 1).
3. Redondeo **mitad hacia arriba** con 2 decimales (configurable): 6,995 → 7,00.
4. **"Lo que se ve es lo que se suma":** el promedio anual se calcula con los
   promedios de cada período ya redondeados, tal como aparecen en pantalla.
   Cualquier persona puede rehacer la cuenta con una calculadora y obtener lo
   mismo.
5. "Sin notas" no es lo mismo que "0": un período sin evaluaciones no baja el
   promedio, se muestra como "—".
6. El promedio anual se calcula con los dos cuatrimestres (períodos
   *regulares*). Diciembre y febrero son instancias *compensatorias* para
   quienes no aprobaron y no entran en ese promedio.

### Reglas de la ETec

| Tema | Regla |
|---|---|
| Nota de aprobación | 7 |
| Períodos | 1° y 2° cuatrimestre, más las instancias de diciembre y febrero |
| Asistencia | Tope de 20 inasistencias por ciclo lectivo |
| Sanciones | Las aplican preceptores y directivos |
| Boletín | No se emite: las familias ven las notas en la plataforma |

## Roles

Una persona puede tener varios roles a la vez (por ejemplo, un docente que
también es padre de un alumno) y ve lo que corresponde a cada uno.

| Rol | Ve y hace |
|---|---|
| **Administrador del sistema** | Todo, más la configuración técnica y los usuarios. |
| **Directivo** | Toda la escuela: notas, asistencia, convivencia, reportes. Envía comunicados institucionales y cierra períodos. |
| **Administrativo** | Legajos, matrículas, usuarios y familias. Envía comunicados. |
| **Preceptor** | Sus cursos: toma asistencia, registra observaciones y sanciones, se comunica con las familias. |
| **Docente** | Sus materias: carga evaluaciones y notas, registra asistencia por materia, escribe a las familias de sus alumnos. |
| **Familia (tutor)** | Todos sus hijos desde una sola cuenta: notas, asistencia, sanciones, comunicados, mensajes, autorizaciones. |
| **Alumno** | Sus propias notas, asistencia, calendario y comunicados. |

## Módulos

| Módulo | Contenido | Etapa |
|---|---|---|
| **Base** | Login (email o DNI), sesiones, roles, navegación, inicio por rol, PWA | ✅ 1 |
| **Gestión académica** | Ciclos lectivos, períodos, materias, cursos y divisiones, asignación de docentes y preceptores | ✅ 2 |
| **Personas y legajos** | Alta y edición de alumnos, familias y personal; matrículas; vínculos familiares; carga masiva desde planillas | ✅ 2 |
| **Calificaciones** | Evaluaciones por materia y período, carga rápida tipo planilla, promedios, cierre de período, instancias de diciembre y febrero | 3 |
| **Asistencia** | Toma diaria del preceptor, asistencia por materia, llegadas tarde, justificaciones, alertas al acercarse al tope de 20 faltas | 4 |
| **Comunicados** | Circulares por escuela, curso o rol, adjuntos, confirmación de lectura ("notificado"), seguimiento de quién no leyó | 5 |
| **Notificaciones** | Bandeja dentro de la app, push (PWA) y email, con preferencias por usuario | 5 |
| **Mensajería** | Chat familia ↔ docente, preceptor o directivo, con reglas de quién puede escribir a quién | 6 |
| **Convivencia** | Observaciones, sanciones y actas (las aplican preceptores y directivos), notificación y firma de la familia | 6 |
| **Calendario** | Evaluaciones, actos, feriados y eventos por curso | 7 |
| **Autorizaciones** | Salidas educativas y permisos con firma digital de la familia | 7 |
| **Reportes** | Rendimiento por curso y materia, ausentismo, alumnos en riesgo | 8 |
| Futuro | Horarios, tareas, inscripciones online, cuotas y pagos (hoy los maneja la Universidad), otros niveles | — |

## Hoja de ruta

Cada etapa se entrega como un pull request revisable y funcionando de punta a
punta: modelo de datos, pantallas, permisos y tests.

1. ✅ **Base del proyecto:** estructura, login, roles, inicio por rol,
   cálculo de promedios con tests y datos de prueba.
2. ✅ **Gestión académica y personas:** configuración de la escuela y ciclos,
   materias, cursos, personas, familias, matrículas e importación desde
   planillas.
3. **Calificaciones:** el corazón del sistema.
4. **Asistencia.**
5. **Comunicados y notificaciones.**
6. **Mensajería y convivencia.**
7. **Calendario y autorizaciones.**
8. **Reportes.**

## Decisiones técnicas

| Tema | Decisión | Por qué |
|---|---|---|
| Framework | Next.js 15 + TypeScript | Frontend y backend en un solo proyecto; muy usado, buen portfolio. |
| Base de datos | PostgreSQL + Prisma | Los datos escolares son muy relacionales; Prisma da migraciones y tipos. |
| Estilos | Tailwind CSS con componentes propios | Interfaz consistente y liviana, sin dependencias pesadas. |
| Sesiones | Propias, guardadas en la base | El navegador sólo tiene un token aleatorio; en la base se guarda su hash. Cerrar sesión la invalida de verdad. |
| Contraseñas | bcrypt | Estándar. El login limita los intentos fallidos. |
| Despliegue | Node.js + systemd + proxy con HTTPS, sin Docker | Simple de mantener en el homelab y en el servidor de la ETec. |
| Idioma | Interfaz y documentación en español; código en inglés | |

## Cuentas y contraseñas

- Todas las personas se identifican por su **DNI**; el email es opcional.
- Las cuentas que crea la escuela (a mano o por importación) arrancan con el
  DNI como contraseña y se pide cambiarla en el primer ingreso.
- Si alguien se olvida la contraseña, el personal la restablece desde su ficha
  en Personas: vuelve a ser el DNI y se cierran sus sesiones abiertas.
- Desactivar una cuenta impide el ingreso y cierra sus sesiones. No se borran
  personas, para no perder su historial.
- Permisos sobre personas: un administrativo no puede modificar directivos ni
  administradores; un directivo no puede modificar administradores del sistema.
  Nadie puede cambiar sus propios roles.

## Pendiente de definir

- Tipos de sanción del régimen de convivencia (se definen antes de la etapa 6).
- Cómo cuentan las llegadas tarde y las faltas por materia respecto del tope
  de 20 inasistencias (antes de la etapa 4).
