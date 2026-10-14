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
| **Calificaciones** | Planilla tipo Excel por materia y período, promedios ponderados, cierre de período, instancias de diciembre y febrero, exportación a Excel, vista de notas para alumnos y familias | ✅ 3 |
| **Asistencia** | Lista diaria del preceptor (con teclado), llegadas tarde y retiros, justificaciones, planilla mensual exportable, alertas al acercarse al tope | ✅ 4 |
| **Comunicados** | Circulares por escuela, curso o rol, adjuntos, confirmación de lectura ("notificado"), seguimiento de quién no leyó y recordatorios | ✅ 5 |
| **Notificaciones** | Bandeja con campana, push (PWA) y email opcional, con registro de entrega | ✅ 5 |
| **Mensajería** | Chat familia ↔ docente, preceptor o directivo, con reglas de quién puede escribir a quién | ✅ 6 |
| **Convivencia** | Observaciones, reconocimientos y sanciones (las aplican preceptores y directivos), firma de la familia con comentario | ✅ 6 |
| **Calendario** | Vista mensual y agenda; evaluaciones de la planilla automáticas; feriados, actos, reuniones y salidas por escuela o curso | ✅ 7 |
| **Autorizaciones** | Salidas educativas y permisos con respuesta digital de la familia, plazo y seguimiento | ✅ 7 |
| **Reportes** | Tablero de la dirección: promedios por curso, distribución, materias con más desaprobados, ausentismo, alumnos en riesgo (exportable) | ✅ 8 |
| **Seguridad** | Verificación en dos pasos, contraseñas iniciales al azar y política de contraseñas, sesiones por dispositivo, límites de intentos, registro de auditoría, CSP y encabezados, validación de adjuntos, servidor aislado y backups (ver `docs/SEGURIDAD.md`) | ✅ 9 |
| Futuro | Horarios, tareas, inscripciones online, cuotas y pagos (hoy los maneja la Universidad), otros niveles | — |

## Hoja de ruta

Cada etapa se entrega como un pull request revisable y funcionando de punta a
punta: modelo de datos, pantallas, permisos y tests.

1. ✅ **Base del proyecto:** estructura, login, roles, inicio por rol,
   cálculo de promedios con tests y datos de prueba.
2. ✅ **Gestión académica y personas:** configuración de la escuela y ciclos,
   materias, cursos, personas, familias, matrículas e importación desde
   planillas.
3. ✅ **Calificaciones:** planilla tipo Excel, resultado final por materia y
   vista para alumnos y familias.
4. ✅ **Asistencia.**
5. ✅ **Comunicados y notificaciones.**
6. ✅ **Mensajería y convivencia.**
7. ✅ **Calendario y autorizaciones.**
8. ✅ **Reportes.**
9. ✅ **Seguridad:** ver `docs/SEGURIDAD.md`.

## Decisiones técnicas

| Tema | Decisión | Por qué |
|---|---|---|
| Framework | Next.js 15 + TypeScript | Frontend y backend en un solo proyecto; muy usado, buen portfolio. |
| Base de datos | PostgreSQL + Prisma | Los datos escolares son muy relacionales; Prisma da migraciones y tipos. |
| Estilos | Tailwind CSS con componentes propios | Interfaz consistente y liviana, sin dependencias pesadas. |
| Sesiones | Propias, guardadas en la base | El navegador sólo tiene un token aleatorio; en la base se guarda su hash. Cerrar sesión la invalida de verdad. |
| Contraseñas | bcrypt + verificación en dos pasos opcional (TOTP) | Estándar. El login limita los intentos fallidos por cuenta y por IP. Ver `docs/SEGURIDAD.md`. |
| Despliegue | Node.js + systemd + proxy con HTTPS, sin Docker | Simple de mantener en el homelab y en el servidor de la ETec. |
| Idioma | Interfaz y documentación en español; código en inglés | |

## Calificaciones

### La planilla

Cada materia de cada curso tiene una planilla por período: filas = alumnos,
columnas = evaluaciones. Se usa como Excel:

- Escribir y Enter baja, Tab va a la derecha; flechas para moverse.
- Se acepta `7`, `7,5` o `7.5`; `A` = ausente.
- Shift + flechas o arrastrar selecciona; Supr borra; Ctrl+C / Ctrl+V copian
  y pegan bloques (también desde y hacia Excel); pegar un valor en una
  selección lo repite en todas las celdas.
- Ctrl+Z / Ctrl+Y deshacen y rehacen.
- Se guarda sola. Una celda inválida se marca en rojo y no se guarda hasta
  corregirla.
- Cada evaluación tiene nombre, tipo, fecha y peso (un examen con peso 2 vale
  el doble). Las columnas se pueden reordenar y eliminar.
- Abajo está el promedio del curso por evaluación y cuántas notas hay cargadas.
- "Descargar Excel" baja la planilla con una hoja por período y el resumen.

Carga notas el docente de la materia. La dirección también puede, para
corregir. Administración y el preceptor del curso la ven en sólo lectura.
Cuando la dirección cierra un período, su planilla queda de sólo lectura.

### Resultado final

- Promedio del período: promedio ponderado de sus evaluaciones. Ausentes y
  celdas vacías no cuentan.
- Anual: promedio de los dos cuatrimestres (como se muestran).
- Con 7 o más aprueba. Si no, pasa a diciembre; si no aprueba en diciembre, a
  febrero; si tampoco, queda **previa**.
- Las planillas de diciembre y febrero muestran sólo a quienes tienen que
  rendir, y se arman cuando la dirección cierra el período anterior.
- Alumnos y familias ven cada nota en cuanto se carga, con el detalle por
  evaluación.

Si alguien quita una materia de un curso o un alumno de una lista, sus notas
se borrarían en cascada. Por eso, si ya hay notas, el sistema no lo permite y
pide cambiar el estado del alumno a Pase o Baja.

## Asistencia

- El preceptor del curso (o la dirección/administración) toma lista una vez
  por día. La lista arranca con todos presentes: sólo se marcan las
  excepciones. Teclado: ↑ ↓ para moverse, P / A / T / R para marcar, J para
  justificar.
- Ausente = 1 falta; llegada tarde y retiro anticipado suman la fracción que
  se configure (por defecto ¼ y ½). Si las justificadas suman para el tope
  también es configurable (por defecto sí).
- Alertas: "Atención" desde el 75 % del tope, "Cerca del tope" desde el 90 %
  y "Superó el tope" al llegar a 20.
- Planilla mensual por curso (como el registro en papel) con descarga a Excel.
- Alumnos y familias ven el total, la barra hasta el tope y el detalle de
  cada inasistencia con su motivo.
- Se guarda una fila por alumno y día (también los presentes) para distinguir
  "presente" de "no se tomó lista".

## Comunicados y notificaciones

- **Quién envía:** dirección y administración, a cualquier grupo (familias,
  alumnos, docentes, preceptores, administración, directivos), a toda la
  escuela o a cursos. Preceptores y docentes, sólo a familias y alumnos de sus
  cursos.
- Los destinatarios se calculan al enviar y quedan registrados: se ve quién
  lo leyó y, si se pidió, quién se notificó (con fecha y hora). Con un botón
  se manda un recordatorio a los que faltan.
- Adjuntos: hasta 5 archivos de 10 MB (PDF, imágenes, Office). Se descargan
  sólo si la persona es destinataria, autora o del personal.
- **Notificaciones:** todo aviso queda en la bandeja (campana con contador).
  Además se envía por push al celular/computadora si la persona lo activó, y
  por email si el servidor tiene SMTP y la persona tiene email. Se registra
  cuándo salió cada push y cada email.
- Avisos automáticos de asistencia: a la familia cuando el alumno queda
  ausente ese día, y a la familia y al alumno cuando cruza un umbral de
  inasistencias.

## Mensajería

Conversaciones privadas de a dos. Quién le puede escribir a quién:

| Persona | Puede escribirle a |
|---|---|
| Dirección y administración | Cualquiera |
| Docentes y preceptores | Personal, otros docentes y preceptores, alumnos de sus cursos y sus familias |
| Familias | Docentes y preceptor de sus hijos, dirección y administración |
| Alumnos | Sus docentes y su preceptor |

Nunca entre familias ni entre alumnos. Enter envía, Shift+Enter hace un salto
de línea. Se ve "Leído" cuando la otra persona abrió la conversación. Llega un
aviso por conversación (no uno por mensaje) mientras no se lea.

## Convivencia

- Tipos: reconocimiento, observación, llamado de atención, apercibimiento,
  acta y suspensión.
- Registran: el preceptor del curso y la dirección (cualquier tipo); los
  docentes del curso sólo observaciones y reconocimientos.
- Las sanciones piden por defecto la firma de la familia, que confirma que se
  notificó y puede dejar un comentario o descargo (llega como aviso a quien
  registró).
- Ven el registro: el alumno, su familia, el preceptor y los docentes del
  curso, y el personal.

## Calendario

- Vista mensual (lunes a domingo) y agenda del mes. Cada persona ve los
  eventos de toda la escuela y los de sus cursos (familias: los de cada hijo,
  con filtro).
- Las evaluaciones con fecha cargadas en la planilla de notas aparecen solas.
- La dirección y administración cargan cualquier evento (incluidos feriados y
  recesos) para toda la escuela o por curso. Docentes y preceptores cargan
  evaluaciones, salidas, reuniones y actos para sus cursos.
- Al cargar un evento se puede avisar a las familias y alumnos.

## Autorizaciones

- Docentes, preceptores y la dirección piden autorización para uno o más
  cursos, con fecha de la actividad y plazo para responder. Opcionalmente se
  agrega al calendario.
- Cada familia responde por cada hijo "Autorizo / No autorizo" con un
  comentario. Queda registrado quién respondió y cuándo; se puede cambiar
  hasta el plazo.
- Seguimiento por alumno con filtro de quienes no respondieron y recordatorio
  con un botón.

## Reportes

- Para la dirección (toda la escuela) y los preceptores (sus cursos).
- Indicadores: promedio general, porcentaje de materias por debajo de la nota
  de aprobación, alumnos en riesgo y alertas de asistencia.
- Gráficos: promedio por curso (con la línea de aprobación), distribución de
  promedios, materias con más alumnos abajo, inasistencias promedio por curso.
  Cada gráfico tiene tooltip y vista de tabla.
- **Alumno en riesgo:** 3 o más materias por debajo de la nota de aprobación,
  o inasistencias desde el 90 % del tope. Lista filtrable por curso y
  descargable en CSV para Excel.
- Los promedios son "hasta hoy": usan los períodos con notas cargadas.

## Ficha del alumno

Dirección, administración, el preceptor del curso y sus docentes pueden tocar
el nombre de un alumno (en el curso, en reportes o en las alertas de
asistencia) y ver todo en un lugar: promedio general, materias por debajo de
la nota de aprobación, inasistencias y registros de convivencia, con pestañas
de Notas, Asistencia, Convivencia y Familia (contacto, llamado, email y
mensaje). En el Inicio de la dirección y de cada preceptor aparecen los
"Alumnos para seguir".

## Diseño

Sobrio, al estilo de Apple y Google: fondo gris claro, tarjetas blancas sin
bordes, títulos grandes, un solo color de acento y listas agrupadas. En el
celular hay una barra de pestañas abajo (Inicio, Notas, Asistencia, Mensajes y
Más), pensada para que las familias lo usen con una mano.

## Inicio

Cada persona ve al entrar lo que le importa: pendientes (comunicados para
notificarse, registros para firmar, autorizaciones sin responder), eventos de
las próximas dos semanas y un resumen según su rol. Las familias ven una
tarjeta por hijo con su promedio, materias abajo y faltas, y accesos directos
a notas y asistencia.

## Cuentas y contraseñas

- Todas las personas se identifican por su **DNI**; el email es opcional.
- Las cuentas que crea la escuela (a mano o por importación) arrancan con una
  contraseña al azar que se muestra una sola vez (la importación la da en un
  CSV) y se pide cambiarla en el primer ingreso.
- Si alguien se olvida la contraseña, el personal la restablece desde su ficha
  en Personas: se genera otra al azar y se cierran sus sesiones abiertas.
- Contraseñas de al menos 10 caracteres que no contengan el DNI ni el nombre.
- Verificación en dos pasos opcional para todos y exigible al personal de
  gestión. Detalles en `docs/SEGURIDAD.md`.
- Desactivar una cuenta impide el ingreso y cierra sus sesiones. No se borran
  personas, para no perder su historial.
- Permisos sobre personas: un administrativo no puede modificar directivos ni
  administradores; un directivo no puede modificar administradores del sistema.
  Nadie puede cambiar sus propios roles.

## Pendiente de definir

- Criterio de "alumno en riesgo" (hoy: 3 materias abajo o 90 % del tope de faltas).
- Si un ausente en una evaluación cuenta como 1 o no cuenta (hoy no cuenta).
- Si además del promedio anual hace falta aprobar el 2° cuatrimestre.

- Tipos de sanción del régimen de convivencia (hoy: llamado de atención,
  apercibimiento, acta y suspensión) y si los docentes pueden aplicar alguna.
- Valor de la llegada tarde y del retiro anticipado (hoy ¼ y ½, configurable).
- Si se toma asistencia por materia además de la diaria (hoy sólo diaria).
