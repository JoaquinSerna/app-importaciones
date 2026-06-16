import { NuevaVersionParametrosForm } from "@/components/parametros/NuevaVersionParametrosForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { ParametrosGlobales } from "@/lib/types";

function formatFechaHora(fecha: string) {
  return new Date(fecha).toLocaleString("es-AR");
}

export default async function ParametrosPage() {
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  let esAdmin = false;

  if (userData?.user) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("rol")
      .eq("id", userData.user.id)
      .single();
    esAdmin = perfil?.rol === "admin";
  }

  const { data: historial } = await supabase
    .from("parametros_globales")
    .select("*")
    .order("created_at", { ascending: false });

  const historialList = (historial ?? []) as ParametrosGlobales[];
  const ultimaVersion = historialList[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parámetros globales</h1>
        <p className="text-muted-foreground">
          Historial de versiones de parámetros usados en la cascada de costos. Es una tabla append-only:
          nunca se edita una versión existente.
        </p>
      </div>

      {esAdmin ? (
        <NuevaVersionParametrosForm ultimaVersion={ultimaVersion} />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Acceso restringido: solo un administrador puede crear nuevas versiones de parámetros. Podés
            consultar el historial debajo.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de versiones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">TC USD/ARS</TableHead>
                <TableHead className="text-right">Gasto terminal</TableHead>
                <TableHead className="text-right">Flete interno</TableHead>
                <TableHead className="text-right">Seguro %</TableHead>
                <TableHead className="text-right">Derecho imp. %</TableHead>
                <TableHead className="text-right">IVA general %</TableHead>
                <TableHead className="text-right">IVA reducido %</TableHead>
                <TableHead className="text-right">Honorarios %</TableHead>
                <TableHead className="text-right">Mín. honorarios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historialList.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatFechaHora(p.created_at)}</TableCell>
                  <TableCell className="text-right">{p.tc_usd_ars}</TableCell>
                  <TableCell className="text-right">{p.gasto_terminal_usd}</TableCell>
                  <TableCell className="text-right">{p.flete_interno_usd}</TableCell>
                  <TableCell className="text-right">{p.seguro_pct}</TableCell>
                  <TableCell className="text-right">{p.derecho_importacion_pct}</TableCell>
                  <TableCell className="text-right">{p.iva_general_pct}</TableCell>
                  <TableCell className="text-right">{p.iva_pct_reducido}</TableCell>
                  <TableCell className="text-right">{p.honorarios_despachante_pct}</TableCell>
                  <TableCell className="text-right">{p.honorarios_despachante_minimo_usd}</TableCell>
                </TableRow>
              ))}
              {historialList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    Sin versiones de parámetros registradas.
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
