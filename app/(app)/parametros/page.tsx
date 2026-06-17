import { NuevaVersionParametrosForm } from "@/components/parametros/NuevaVersionParametrosForm";
import { DeleteParametrosButton } from "@/components/parametros/DeleteParametrosButton";
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
          Historial de versiones de parámetros fijos del negocio. Los aranceles por posición NCM se
          configuran en la sección NCMs. Es una tabla append-only: nunca se edita una versión existente.
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
                <TableHead className="text-right">Flete intern.</TableHead>
                <TableHead className="text-right">Gasto terminal</TableHead>
                <TableHead className="text-right">Flete local</TableHead>
                <TableHead className="text-right">Seguro %</TableHead>
                <TableHead className="text-right">Honorarios %</TableHead>
                <TableHead className="text-right">Mín. honor.</TableHead>
                <TableHead className="text-right">Bcos. %</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historialList.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatFechaHora(p.created_at)}</TableCell>
                  <TableCell className="text-right">{p.tc_usd_ars}</TableCell>
                  <TableCell className="text-right">{p.flete_internacional_usd}</TableCell>
                  <TableCell className="text-right">{p.gasto_terminal_usd}</TableCell>
                  <TableCell className="text-right">{p.flete_interno_usd}</TableCell>
                  <TableCell className="text-right">{p.seguro_pct}</TableCell>
                  <TableCell className="text-right">{p.honorarios_despachante_pct}</TableCell>
                  <TableCell className="text-right">{p.honorarios_despachante_minimo_usd}</TableCell>
                  <TableCell className="text-right">{p.gastos_bancarios_pct}</TableCell>
                  <TableCell>
                    <DeleteParametrosButton id={p.id} fecha={formatFechaHora(p.created_at)} />
                  </TableCell>
                </TableRow>
              ))}
              {historialList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
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
