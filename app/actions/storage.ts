"use server";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "documentos";
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

function extraerPath(fileUrl: string): string | null {
  const idx = fileUrl.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return null;
  return fileUrl.slice(idx + PUBLIC_URL_MARKER.length);
}

export async function obtenerUrlDescarga(fileUrl: string): Promise<string> {
  const path = extraerPath(fileUrl);
  if (!path) return fileUrl;

  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo generar el enlace de descarga.");
  }
  return data.signedUrl;
}

export async function obtenerUrlsFirmadas(fileUrls: string[]): Promise<Record<string, string>> {
  const supabase = createClient();
  const resultado: Record<string, string> = {};

  await Promise.all(
    fileUrls.map(async (url) => {
      const path = extraerPath(url);
      if (!path) {
        resultado[url] = url;
        return;
      }
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      resultado[url] = !error && data ? data.signedUrl : url;
    })
  );

  return resultado;
}
