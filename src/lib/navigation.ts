import {
  BarChart3,
  BookOpen,
  BookText,
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  Home,
  Megaphone,
  MessageCircle,
  School,
  Settings,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles que ven el ítem. Sin definir = todos. */
  roles?: Role[];
  group: "principal" | "escuela" | "gestion";
};

const STAFF: Role[] = ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"];

export const NAV_GROUP_LABELS: Record<NavItem["group"], string | null> = {
  principal: null,
  escuela: "Escuela",
  gestion: "Gestión",
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Home, group: "principal" },
  { href: "/notas", label: "Notas", icon: BookOpen, group: "principal" },
  { href: "/asistencia", label: "Asistencia", icon: ClipboardCheck, group: "principal" },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, group: "principal" },
  { href: "/comunicados", label: "Comunicados", icon: Megaphone, group: "principal" },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, group: "principal" },
  { href: "/convivencia", label: "Convivencia", icon: ShieldAlert, group: "escuela" },
  { href: "/autorizaciones", label: "Autorizaciones", icon: FileSignature, roles: [...STAFF, "PRECEPTOR", "DOCENTE", "TUTOR"], group: "escuela" },
  { href: "/reportes", label: "Reportes", icon: BarChart3, roles: ["SUPERADMIN", "DIRECTIVO", "PRECEPTOR"], group: "escuela" },
  { href: "/cursos", label: "Cursos", icon: School, roles: [...STAFF, "PRECEPTOR"], group: "gestion" },
  { href: "/personas", label: "Personas", icon: Users, roles: STAFF, group: "gestion" },
  { href: "/materias", label: "Materias", icon: BookText, roles: STAFF, group: "gestion" },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["SUPERADMIN", "DIRECTIVO"], group: "gestion" },
];

export function navItemsFor(roles: Role[]) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}

/** Pestañas fijas de la barra inferior en el celular (el resto va en "Más"). */
export const TAB_BAR_HREFS = ["/inicio", "/notas", "/asistencia", "/mensajes"];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
