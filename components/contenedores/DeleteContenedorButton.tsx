"use client";

import { DeleteButton } from "@/components/ui/DeleteButton";
import { eliminarContenedor } from "@/app/(app)/contenedores/actions";

export function DeleteContenedorButton({ id, numero }: { id: string; numero: string | null }) {
  return (
    <DeleteButton
      label="Borrar"
      description={`Se eliminará el contenedor ${numero ?? id} junto con sus costos. Esta acción no se puede deshacer.`}
      onDelete={() => eliminarContenedor(id)}
    />
  );
}
