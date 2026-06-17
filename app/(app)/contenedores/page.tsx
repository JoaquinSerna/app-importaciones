import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteContenedorButton } from "@/components/contenedores/DeleteContenedorButton";
import { createClient } from "@/lib/supabase/server";
import type { Contenedor } from "@/lib/types";

function formatFecha(fecha: string | null) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-AR");
}

export default async function ContenedoresPage() {
  const supabase = createClient();

  const { data: contenedores } = await supabase
    .from("contenedores")
    .select("*")
    .order("created_at", { ascending: false });

  const lista = (contenedores ?? []) as Contenedor[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contenedores</h1>
          <p className="text-muted-foreground">Gestión de contenedores y consolidación de carpetas.</p>
        </div>
        <Link href="/contenedores/nuevo">
          <Button>Nuevo contenedor</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Zarpe</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/contenedores/${c.id}`} className="font-medium hover:underline">
                      {c.numero_contenedor ?? "(sin número)"}
                    </Link>
                  </TableCell>
                  <TableCell>{c.tipo}</TableCell>
                  <TableCell>{formatFecha(c.fecha_zarpe)}</TableCell>
                  <TableCell>{formatFecha(c.eta_contenedor)}</TableCell>
                  <TableCell>
                    {c.estado_contenedor ? <Badge variant="secondary">{c.estado_contenedor}</Badge> : "-"}
                  </TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/contenedores/${c.id}`}>Ver</Link>
                    </Button>
                    <DeleteContenedorButton id={c.id} numero={c.numero_contenedor} />
                  </TableCell>
                </TableRow>
              ))}
              {lista.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Sin contenedores registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
