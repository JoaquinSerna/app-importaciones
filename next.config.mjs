/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Red de seguridad: nos aseguramos de que el nomenclador de AFIP (data/,
    // leído en runtime vía fs desde lib/nomenclador.ts) se empaquete con las
    // funciones serverless, sin depender de que el file tracing automático
    // de Next detecte el fs.readFileSync con path.join.
    outputFileTracingIncludes: {
      "/**": ["./data/nomenclador_30062026.txt.gz"],
    },
  },
};

export default nextConfig;
