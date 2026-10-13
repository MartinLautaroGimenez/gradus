"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn, initials } from "@/lib/utils";

type Contact = { id: string; firstName: string; lastName: string; details: string[] };

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function ContactPicker({ contacts, selectedId }: { contacts: Contact[]; selectedId?: string }) {
  const [query, setQuery] = useState("");
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const shown = contacts.filter((c) => {
    const haystack = normalize(`${c.firstName} ${c.lastName} ${c.details.join(" ")}`);
    return terms.every((t) => haystack.includes(t));
  });

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, materia o curso"
        aria-label="Buscar contacto"
        autoFocus
      />
      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-2xl bg-surface shadow-card">
        {shown.length === 0 && <li className="p-4 text-sm text-muted">No hay contactos que coincidan.</li>}
        {shown.slice(0, 200).map((c) => (
          <li key={c.id}>
            <Link
              href={`/mensajes/nuevo?para=${c.id}`}
              className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted", c.id === selectedId && "bg-primary-soft")}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-muted">
                {initials(c)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {c.lastName}, {c.firstName}
                </span>
                <span className="block truncate text-xs text-muted">{c.details.join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
