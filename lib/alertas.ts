import { differenceInCalendarDays } from "date-fns";

import type { Carpeta } from "@/lib/types";

// Thresholds configurables (días)
export const DIAS_AVISO_PAGO_ANTICIPO = 3;
export const DIAS_AVISO_PAGO_SALDO = 3;
export const DIAS_AVISO_ETA = 7;
export const DIAS_LIMITE_EN_ADUANA_SIN_LIBERACION = 10;
export const DIAS_LIMITE_SIN_ETA_DESDE_EMBARQUE = 2;

export type SeveridadAlerta = "info" | "warning" | "danger";

export interface Alerta {
  tipo:
    | "pago_anticipo_proximo"
    | "pago_saldo_proximo"
    | "eta_proximo"
    | "en_aduana_demorada"
    | "sin_eta_cargada";
  mensaje: string;
  severidad: SeveridadAlerta;
}

function hoy(): Date {
  return new Date();
}

/**
 * Calcula la lista de alertas activas para una carpeta según las reglas de negocio:
 *  - Pago de anticipo en <= N días y todavía no pagado.
 *  - Pago de saldo en <= N días y todavía no pagado.
 *  - ETA en <= N días.
 *  - En aduana hace más de N días sin fecha de liberación.
 *  - Sin ETA cargada con fecha de embarque hace más de N días.
 */
export function calcularAlertas(carpeta: Carpeta): Alerta[] {
  const alertas: Alerta[] = [];
  const ahora = hoy();

  if (carpeta.fecha_pago_anticipo && !carpeta.monto_anticipo_usd) {
    const dias = differenceInCalendarDays(new Date(carpeta.fecha_pago_anticipo), ahora);
    if (dias <= DIAS_AVISO_PAGO_ANTICIPO) {
      alertas.push({
        tipo: "pago_anticipo_proximo",
        mensaje:
          dias < 0
            ? `Pago de anticipo vencido hace ${Math.abs(dias)} día(s)`
            : `Pago de anticipo en ${dias} día(s)`,
        severidad: dias < 0 ? "danger" : "warning",
      });
    }
  }

  if (carpeta.fecha_pago_saldo && !carpeta.monto_saldo_usd) {
    const dias = differenceInCalendarDays(new Date(carpeta.fecha_pago_saldo), ahora);
    if (dias <= DIAS_AVISO_PAGO_SALDO) {
      alertas.push({
        tipo: "pago_saldo_proximo",
        mensaje:
          dias < 0
            ? `Pago de saldo vencido hace ${Math.abs(dias)} día(s)`
            : `Pago de saldo en ${dias} día(s)`,
        severidad: dias < 0 ? "danger" : "warning",
      });
    }
  }

  if (carpeta.eta && !carpeta.fecha_arribo_real) {
    const dias = differenceInCalendarDays(new Date(carpeta.eta), ahora);
    if (dias <= DIAS_AVISO_ETA) {
      alertas.push({
        tipo: "eta_proximo",
        mensaje:
          dias < 0
            ? `ETA vencida hace ${Math.abs(dias)} día(s)`
            : `ETA en ${dias} día(s)`,
        severidad: dias < 0 ? "danger" : "warning",
      });
    }
  }

  if (carpeta.estado === "en_aduana" && !carpeta.fecha_liberacion && carpeta.fecha_arribo_real) {
    const dias = differenceInCalendarDays(ahora, new Date(carpeta.fecha_arribo_real));
    if (dias > DIAS_LIMITE_EN_ADUANA_SIN_LIBERACION) {
      alertas.push({
        tipo: "en_aduana_demorada",
        mensaje: `En aduana hace ${dias} día(s) sin liberación`,
        severidad: "danger",
      });
    }
  }

  if (!carpeta.eta && carpeta.fecha_embarque) {
    const dias = differenceInCalendarDays(ahora, new Date(carpeta.fecha_embarque));
    if (dias > DIAS_LIMITE_SIN_ETA_DESDE_EMBARQUE) {
      alertas.push({
        tipo: "sin_eta_cargada",
        mensaje: `Sin ETA cargada (embarcada hace ${dias} día(s))`,
        severidad: "warning",
      });
    }
  }

  return alertas;
}
