"use client";

import { useState } from "react";
import ExcelJS from "exceljs";

import { Button } from "@/components/ui/button";
import type { CarpetaReporteData } from "@/components/reportes/ExportarPdfButton";

export function ExportarExcelButton({ data }: { data: CarpetaReporteData }) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleExportar() {
    setIsGenerating(true);
    try {
      const { carpeta, costos } = data;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Costos");

      sheet.columns = [
        { header: "Concepto", key: "concepto", width: 30 },
        { header: "Categoría", key: "categoria", width: 16 },
        { header: "Origen", key: "origen", width: 16 },
        { header: "Estimado USD", key: "estimado", width: 16 },
        { header: "Real USD", key: "real", width: 16 },
        { header: "TC aplicado", key: "tc", width: 14 },
      ];

      sheet.getRow(1).font = { bold: true };

      for (const costo of costos) {
        sheet.addRow({
          concepto: costo.concepto,
          categoria: costo.categoria,
          origen: costo.origen,
          estimado: costo.monto_estimado_usd,
          real: costo.monto_real_usd ?? null,
          tc: costo.tc_aplicado ?? null,
        });
      }

      sheet.addRow({});
      const totalRow = sheet.addRow({
        concepto: "TOTAL",
        estimado: costos.reduce((acc, c) => acc + c.monto_estimado_usd, 0),
        real: costos.reduce((acc, c) => acc + (c.monto_real_usd ?? 0), 0),
      });
      totalRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `costos-${carpeta.numero_carpeta}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExportar} disabled={isGenerating}>
      {isGenerating ? "Generando..." : "Exportar Excel"}
    </Button>
  );
}
