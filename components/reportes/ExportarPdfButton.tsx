"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { calcularCostoUnitarioPorSku, construirFilaComparativa } from "@/lib/reportes";
import type { Carpeta, Costo, Sku } from "@/lib/types";

export interface CarpetaReporteData {
  carpeta: Carpeta;
  proveedorNombre: string | null;
  costos: Costo[];
  skus: Sku[];
}

function formatUsd(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatArs(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

export function ExportarPdfButton({ data }: { data: CarpetaReporteData }) {
  const [isGenerating, setIsGenerating] = useState(false);

  function handleExportar() {
    setIsGenerating(true);
    try {
      const { carpeta, proveedorNombre, costos, skus } = data;
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text(`Reporte de importación - ${carpeta.numero_carpeta}`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Proveedor: ${proveedorNombre ?? "Sin proveedor"}`, 14, 26);
      doc.text(`Estado: ${carpeta.estado}`, 14, 32);

      const fila = construirFilaComparativa(carpeta, costos);

      autoTable(doc, {
        startY: 40,
        head: [["FOB USD", "CIF estimado USD", "Costo real USD", "Varianza %", "Días totales"]],
        body: [
          [
            formatUsd(fila.fobUsd),
            formatUsd(fila.cifEstimadoUsd),
            formatUsd(fila.costoRealUsd),
            fila.varianzaPct !== null ? `${fila.varianzaPct.toFixed(1)}%` : "-",
            fila.diasTotales !== null ? String(fila.diasTotales) : "-",
          ],
        ],
      });

      const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      autoTable(doc, {
        startY: finalY1 + 10,
        head: [["Concepto", "Categoría", "Estimado USD", "Real USD"]],
        body: costos.map((c) => [
          c.concepto,
          c.categoria,
          formatUsd(c.monto_estimado_usd),
          formatUsd(c.monto_real_usd),
        ]),
      });

      const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      const costosUnitarios = calcularCostoUnitarioPorSku(
        skus,
        costos,
        carpeta.fob_total_usd,
        carpeta.tc_snapshot
      );

      autoTable(doc, {
        startY: finalY2 + 10,
        head: [["SKU", "Descripción", "Cantidad", "Costo unitario USD", "Costo unitario ARS"]],
        body: costosUnitarios.map((cu) => [
          cu.codigoSku ?? "-",
          cu.descripcion ?? "-",
          String(cu.cantidad),
          formatUsd(cu.costoUnitarioUsd),
          formatArs(cu.costoUnitarioArs),
        ]),
      });

      doc.save(`reporte-${carpeta.numero_carpeta}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExportar} disabled={isGenerating}>
      {isGenerating ? "Generando..." : "Exportar PDF"}
    </Button>
  );
}
