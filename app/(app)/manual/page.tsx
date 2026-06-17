export default function ManualPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      <div>
        <h1 className="text-3xl font-bold">Manual de usuario</h1>
        <p className="text-muted-foreground mt-1">
          Sistema de gestión de importaciones · Junio 2026
        </p>
      </div>

      {/* Índice */}
      <nav className="rounded-lg border p-4 space-y-1 text-sm">
        <p className="font-semibold mb-2">Contenido</p>
        {[
          ["#intro", "1. Introducción"],
          ["#primeros-pasos", "2. Primeros pasos"],
          ["#parametros", "3. Parámetros globales"],
          ["#ncm", "4. NCMs (Posiciones Arancelarias)"],
          ["#simulador", "5. Simulador / Nueva Carpeta"],
          ["#carpetas", "6. Gestión de Carpetas"],
          ["#dashboard", "7. Dashboard"],
          ["#contenedores", "8. Contenedores"],
          ["#pdf", "9. Extracción de liquidación del despachante"],
          ["#reportes", "10. Reportes"],
          ["#glosario", "11. Glosario"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-muted-foreground hover:text-foreground transition-colors">
            {label}
          </a>
        ))}
      </nav>

      <Section id="intro" title="1. Introducción">
        <p>Esta aplicación te permite planificar, simular y hacer seguimiento de importaciones desde China. Con ella podés:</p>
        <ul>
          <li><strong>Simular el costo total</strong> de una importación antes de confirmar la compra.</li>
          <li><strong>Gestionar carpetas</strong> (una por importación): seguir el estado, cargar fechas clave y subir documentos.</li>
          <li><strong>Registrar los costos reales</strong> cuando llega la liquidación del despachante y comparar con lo estimado.</li>
          <li><strong>Ver un dashboard</strong> con todas las operaciones en curso y sus alertas.</li>
        </ul>
        <Callout title="Flujo general de una importación">
          <ol>
            <li>Configurar parámetros globales (TC, fletes, etc.)</li>
            <li>Cargar el NCM de la mercadería (con sus aranceles)</li>
            <li>Simular → crear carpeta</li>
            <li>Seguir el avance: pre-embarque → en tránsito → en aduana → finalizada</li>
            <li>Subir la liquidación del despachante y confirmar costos reales</li>
          </ol>
        </Callout>
      </Section>

      <Section id="primeros-pasos" title="2. Primeros pasos">
        <p>Accedé a la URL de la aplicación e ingresá con tu usuario y contraseña. Si es tu primer ingreso, el administrador ya habrá creado tu cuenta.</p>
        <Table
          headers={["Rol", "Qué puede hacer"]}
          rows={[
            ["Admin", "Todo: parámetros, NCMs, carpetas, reportes"],
            ["Operador", "Carpetas, NCMs, simulaciones"],
            ["Viewer", "Solo lectura"],
          ]}
        />
        <Callout title="Recomendación de seguridad">
          Cambiá tu contraseña la primera vez que ingresás.
        </Callout>
      </Section>

      <Section id="parametros" title="3. Parámetros globales">
        <p>Los parámetros globales son los costos fijos del negocio que se aplican a todas las importaciones. Se configuran en el menú <strong>Parámetros</strong>.</p>
        <Table
          headers={["Parámetro", "Descripción", "Ejemplo"]}
          rows={[
            ["TC USD/ARS", "Tipo de cambio dólar-peso", "1.200"],
            ["Gasto terminal (USD)", "Costo fijo portuario", "250"],
            ["Flete interno (USD)", "Transporte puerto-depósito La Plata", "400"],
            ["Seguro (%)", "% sobre FOB + Flete", "0,5%"],
            ["Honorarios despachante (%)", "% sobre FOB", "1%"],
            ["Mínimo honorarios (USD)", "Piso del honorario", "450"],
            ["Gastos bancarios (%)", "% sobre CIF", "0,5%"],
          ]}
        />
        <p>Actualizalos cuando cambia el tipo de cambio, el flete o los honorarios. Cada actualización crea una <strong>nueva versión</strong> — las carpetas anteriores mantienen sus valores originales (snapshot).</p>
      </Section>

      <Section id="ncm" title="4. NCMs (Posiciones Arancelarias)">
        <p>Cada producto importado tiene un <strong>código NCM</strong> que determina qué impuestos se pagan. Se cargan en el menú <strong>NCMs</strong>.</p>
        <p>Hacé clic en <strong>"Nuevo NCM"</strong>, completá el código (ej: <code>9403.20.00</code>), la descripción y los aranceles:</p>
        <Table
          headers={["Campo", "Descripción", "Valor típico"]}
          rows={[
            ["Derecho de importación (%)", "Arancel principal sobre el CIF", "20%"],
            ["IVA (%)", "21% general, 10,5% para productos esenciales", "21%"],
            ["IVA adicional (%)", "Percepción extra, si aplica", "20%"],
            ["Anticipo ganancias (%)", "Percepción de ganancias, si aplica", "6%"],
            ["IIBB (%)", "Ingresos brutos de importación, si aplica", "2,5%"],
            ["Tasa estadística (%)", "Tasa AFIP/INDEC, si aplica", "3%"],
          ]}
        />
        <Callout title="Ejemplo real">
          NCM <code>9403.20.00</code> (muebles de madera): derecho 20%, IVA 21%, IVA adicional 20% ✓, anticipo ganancias 6% ✓, IIBB no aplica, tasa estadística 3% ✓.
        </Callout>
        <p>Si cambia un arancel, editá el NCM. Las carpetas ya creadas no se modifican — solo afecta simulaciones futuras.</p>
      </Section>

      <Section id="simulador" title="5. Simulador / Nueva Carpeta">
        <p>El simulador calcula el costo total antes de confirmar la compra. Accedés desde <strong>Carpetas → Nueva carpeta</strong>.</p>
        <ol>
          <li>Seleccioná el <strong>proveedor</strong> y el <strong>NCM</strong>.</li>
          <li>Ingresá el <strong>FOB total en USD</strong>, CBM y peso.</li>
          <li>Seleccioná el <strong>tipo de contenedor</strong>. Si tenés el flete cotizado, ingresalo; si no, el sistema usa los parámetros globales.</li>
          <li>Revisá la cascada de costos calculada automáticamente.</li>
          <li>Si los números cierran, hacé clic en <strong>"Crear carpeta"</strong>.</li>
        </ol>
        <Callout title="Ejemplo de cascada — FOB USD 10.000, NCM con 20% derecho, 21% IVA, 20% IVA adicional, 6% ganancias, tasa estadística 3%">
          <pre className="text-xs leading-relaxed">{`FOB:                          USD 10.000
+ Flete (terminal + interno):  USD    650
+ Seguro (0,5%):               USD     53
= CIF:                         USD 10.703
+ Derecho importación (20%):   USD  2.141
+ Tasa estadística (3%):       USD    321
= Base imponible IVA:          USD 13.165
+ IVA (21%):                   USD  2.765
+ IVA adicional (20%):         USD  2.633
+ Anticipo ganancias (6%):     USD    790
+ Honorarios despachante:      USD    450  (mínimo)
+ Gastos bancarios (0,5%):     USD     54
───────────────────────────────────────────
  TOTAL COSTOS:                USD  9.807
  COSTO TOTAL:                 USD 19.807`}</pre>
        </Callout>
      </Section>

      <Section id="carpetas" title="6. Gestión de Carpetas">
        <Table
          headers={["Estado", "Qué significa"]}
          rows={[
            ["Simulación", "Solo estimación, la compra no está confirmada"],
            ["Pre-embarque", "Compra confirmada, esperando que el proveedor embarque"],
            ["En tránsito", "La mercadería está en el barco"],
            ["En aduana", "Llegó al puerto, el despachante gestiona el despacho"],
            ["Finalizada", "Mercadería liberada y en el depósito"],
          ]}
        />
        <p className="mt-4 font-medium">Tabs dentro de una carpeta:</p>
        <ul>
          <li><strong>Resumen</strong> — Datos generales, FOB, estado, montos de pago.</li>
          <li><strong>SKUs</strong> — Productos de la importación con sus datos (código, cantidad, precio unitario, CBM, peso).</li>
          <li><strong>Costos</strong> — Estimado vs. real. Podés agregar costos manuales imprevistos.</li>
          <li><strong>Timeline</strong> — Fechas clave: pago anticipo, embarque, ETA, arribo, liberación, llegada a depósito.</li>
          <li><strong>Documentos</strong> — Factura comercial, packing list, BL, certificados, etc.</li>
        </ul>
      </Section>

      <Section id="dashboard" title="7. Dashboard">
        <p>Muestra todas las operaciones activas en formato kanban (columnas por estado). Cada tarjeta muestra número, proveedor, FOB y días transcurridos.</p>
        <Table
          headers={["Color", "Significado"]}
          rows={[
            ["Verde", "Todo en orden"],
            ["Amarillo", "Algún plazo se está acercando"],
            ["Rojo", "Fecha vencida o demasiados días sin movimiento"],
          ]}
        />
      </Section>

      <Section id="contenedores" title="8. Contenedores">
        <p>Usá los contenedores cuando agrupás varias carpetas en un mismo envío. Para un FCL generalmente hay una sola carpeta; para LCL puede haber varias.</p>
        <ol>
          <li>Creá el contenedor con los datos del barco (número, naviera, BL, fecha de zarpe, ETA).</li>
          <li>Desde cada carpeta, asignala al contenedor correspondiente.</li>
          <li>Los costos a nivel contenedor (ej: flete FCL) se prorratean entre las carpetas por CBM, peso, FOB o unidades.</li>
        </ol>
      </Section>

      <Section id="pdf" title="9. Extracción de liquidación del despachante">
        <p>Cuando el despachante manda la liquidación, subila para comparar costos reales vs. estimados:</p>
        <ol>
          <li>Carpeta → tab <strong>Costos</strong> → <strong>"Subir liquidación PDF"</strong>.</li>
          <li>El sistema extrae automáticamente los conceptos y montos del PDF.</li>
          <li>Revisá la comparación estimado vs. real.</li>
          <li>Confirmá — los costos reales quedan registrados.</li>
        </ol>
        <Callout title="Si el PDF no se lee bien">
          Algunos PDFs escaneados (imágenes) no se pueden extraer automáticamente. En ese caso, cargá los costos reales manualmente desde <strong>Agregar costo</strong>.
        </Callout>
      </Section>

      <Section id="reportes" title="10. Reportes">
        <Table
          headers={["Reporte", "Para qué sirve"]}
          rows={[
            ["Costos por carpeta", "Detalle de estimado vs. real por importación, exportable a PDF o Excel"],
            ["Comparativo estimado/real", "Dónde se generan las diferencias más grandes entre lo calculado y lo real"],
          ]}
        />
      </Section>

      <Section id="glosario" title="11. Glosario">
        <Table
          headers={["Término", "Significado"]}
          rows={[
            ["FOB", "Free On Board. Precio de la mercadería en el puerto de origen, sin flete ni seguro."],
            ["CIF", "Cost, Insurance and Freight. FOB + flete + seguro. Base para calcular impuestos en Argentina."],
            ["CBM", "Cubic Meter. Metros cúbicos de la mercadería."],
            ["NCM", "Nomenclatura Común del Mercosur. Código de 8 dígitos que clasifica el producto y determina sus aranceles."],
            ["Despacho", "El trámite aduanero para liberar la mercadería. Lo hace el despachante de aduana."],
            ["Tasa estadística", "Arancel cobrado por AFIP/INDEC sobre el CIF. Solo aplica a algunos NCMs."],
            ["Prorrateo", "Dividir un costo común entre varias carpetas o SKUs según CBM, peso, FOB o unidades."],
            ["Snapshot", "Fotografía de los parámetros al crear la carpeta. Garantiza que los cálculos no cambien."],
            ["FCL", "Full Container Load. Contenedor completo exclusivo para tu carga."],
            ["LCL", "Less than Container Load. Grupaje: compartís el contenedor con otras cargas."],
            ["BL", "Bill of Lading (conocimiento de embarque). Documento que emite la naviera."],
            ["ETA", "Estimated Time of Arrival. Fecha estimada de llegada al puerto."],
            ["Liquidación del despachante", "Documento con el detalle de impuestos y gastos pagados para liberar la mercadería."],
          ]}
        />
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-6">
      <h2 className="text-xl font-semibold border-b pb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
        {children}
      </div>
    </section>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1">
      <p className="font-medium text-sm">{title}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2 font-medium text-slate-700 border-b">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
