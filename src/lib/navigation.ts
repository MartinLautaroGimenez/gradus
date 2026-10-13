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
  /** false mientras el módulo no esté construido: se muestra como "Pronto". */
  available: boolean;
};

const STAFF: Role[] = ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Home, available: true },
  { href: "/notas", label: "Notas", icon: BookOpen, available: false },
  { href: "/asistencia", label: "Asistencia", icon: ClipboardCheck, available: false },
  { href: "/comunicados", label: "Comunicados", icon: Megaphone, available: false },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, available: false },
  { href: "/convivencia", label: "Convivencia", icon: ShieldAlert, available: false },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, available: false },
  {
    href: "/autorizaciones",
    label: "Autorizaciones",
    icon: FileSignature,
    roles: [...STAFF, "PRECEPTOR", "TUTOR"],
    available: false,
  },
  { href: "/cursos", label: "Cursos", icon: School, roles: [...STAFF, "PRECEPTOR"], available: true },
  { href: "/materias", label: "Materias", icon: BookText, roles: STAFF, available: true },
  { href: "/personas", label: "Personas", icon: Users, roles: STAFF, available: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, roles: ["SUPERADMIN", "DIRECTIVO"], available: false },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["SUPERADMIN", "DIRECTIVO"], available: true },
];

export function navItemsFor(roles: Role[]) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}
