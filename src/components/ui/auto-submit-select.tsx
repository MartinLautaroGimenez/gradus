"use client";

import { Select } from "./select";

/** Select que envía su formulario al cambiar. Sirve para asignaciones rápidas en tablas. */
export function AutoSubmitSelect(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
