"use client";

import { DeleteButton } from "@/components/ui/DeleteButton";
import { eliminarParametros } from "@/app/(app)/parametros/delete-action";

export function DeleteParametrosButton({ id, fecha }: { id: string; fecha: string }) {
  return (
    <DeleteButton
      label="Borrar"
      description={`Se eliminará la versión de parámetros del ${fecha}. No se puede borrar si hay carpetas que la usan como snapshot.`}
      onDelete={() => eliminarParametros(id)}
    />
  );
}
