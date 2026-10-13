import "server-only";
import type { EventKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { courseLabel } from "@/lib/utils";

export type CalendarItem = {
  key: string;
  kind: EventKind;
  title: string;
  /** "aaaa-mm-dd" */
  start: string;
  end: string | null;
  time: string | null;
  location: string | null;
  courses: string[];
  href: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Eventos y evaluaciones entre dos fechas. `courseIds` null = todos los cursos
 * (personal); si no, los eventos de toda la escuela más los de esos cursos.
 */
export async function loadCalendarItems({ courseIds, from, to }: { courseIds: string[] | null; from: string; to: string }) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const eventCourseFilter: Prisma.CalendarEventWhereInput = courseIds
    ? { OR: [{ courses: { none: {} } }, { courses: { some: { courseId: { in: courseIds } } } }] }
    : {};

  const [events, assessments] = await Promise.all([
    db.calendarEvent.findMany({
      where: {
        AND: [
          eventCourseFilter,
          { startDate: { lte: toDate } },
          { OR: [{ endDate: { gte: fromDate } }, { endDate: null, startDate: { gte: fromDate } }] },
        ],
      },
      include: { courses: { include: { course: true } } },
      orderBy: [{ startDate: "asc" }, { time: "asc" }],
    }),
    db.assessment.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        courseSubject: { course: courseIds ? { id: { in: courseIds } } : { academicYear: { active: true } } },
      },
      include: { courseSubject: { include: { subject: true, course: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const items: CalendarItem[] = [
    ...events.map((e) => ({
      key: e.id,
      kind: e.kind,
      title: e.title,
      start: iso(e.startDate),
      end: e.endDate ? iso(e.endDate) : null,
      time: e.time,
      location: e.location,
      courses: e.courses.map((c) => courseLabel(c.course)),
      href: `/calendario/${e.id}`,
    })),
    ...assessments.map((a) => ({
      key: a.id,
      kind: "EVALUACION" as const,
      title: `${a.courseSubject.subject.name}: ${a.title}`,
      start: iso(a.date!),
      end: null,
      time: null,
      location: null,
      courses: [courseLabel(a.courseSubject.course)],
      href: `/notas`,
    })),
  ];
  return items.sort((a, b) => a.start.localeCompare(b.start) || (a.time ?? "").localeCompare(b.time ?? ""));
}
