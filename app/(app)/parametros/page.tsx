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

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parámetros globales</h1>
        <p className="text-muted-foreground">
          Historial append-only de parámetros del negocio. Los aranceles por posición NCM se
          configuran en la sección NCMs.
        </p>
      </div>

      {esAdmin ? (
        <NuevaVersionParametrosForm ultimaVersion={historialList[0] ?? null} />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Acceso restringido: solo un administrador puede crear nuevas versiones de parámetros.
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
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">Flete intern.</TableHead>
                <TableHead className="text-right">Peak Season</TableHead>
                <TableHead className="text-right">THC</TableHead>
                <TableHead className="text-right">Flete local</TableHead>
                <TableHead className="text-right">TOLL</TableHead>
                <TableHead className="text-right">Dep. fiscal</TableHead>
                <TableHead className="text-right">Digital.</TableHead>
                <TableHead className="text-right">G. Oper.</TableHead>
                <TableHead className="text-right">Tramit.</TableHead>
                <TableHead className="text-right">Seguro %</TableHead>
                <TableHead className="text-right">Honor. %</TableHead>
                <TableHead className="text-right">Mín. hon.</TableHead>
                <TableHead className="text-right">Bcos. %</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historialList.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatFechaHora(p.created_at)}</TableCell>
                  <TableCell className="text-right">{fmt(p.tc_usd_ars)}</TableCell>
                  <TableCell className="text-right">{fmt(p.flete_internacional_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.peak_season_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.thc_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.flete_interno_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.toll_importacion_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.gasto_terminal_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.digitalizacion_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.gastos_operativos_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.tramitaciones_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.seguro_pct)}</TableCell>
                  <TableCell className="text-right">{fmt(p.honorarios_despachante_pct)}</TableCell>
                  <TableCell className="text-right">{fmt(p.honorarios_despachante_minimo_usd)}</TableCell>
                  <TableCell className="text-right">{fmt(p.gastos_bancarios_pct)}</TableCell>
                  <TableCell>
                    <DeleteParametrosButton id={p.id} fecha={formatFechaHora(p.created_at)} />
                  </TableCell>
                </TableRow>
              ))}
              {historialList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={16} className="text-center text-muted-foreground">
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
