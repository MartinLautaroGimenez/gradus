import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.lastName}, ${person.firstName}`;
}

export function initials(person: { firstName: string; lastName: string }) {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
}

/** "3° A" */
export function courseLabel(course: { grade: number; division: string }) {
  return `${course.grade}° ${course.division}`;
}
