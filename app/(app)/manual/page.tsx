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
          ["#intro", "1. Introducción y flujo general"],
          ["#primeros-pasos", "2. Primeros pasos"],
          ["#proveedores", "3. Proveedores"],
          ["#parametros", "4. Parámetros globales"],
          ["#ncm", "5. NCMs (Posiciones Arancelarias)"],
          ["#simulador", "6. Simulador / Nueva Carpeta"],
          ["#carpetas", "7. Gestión de Carpetas"],
          ["#carpeta-documentos", "8. Documentos de la carpeta (Secciones 1, 2 y 3)"],
          ["#contenedores", "9. Contenedores"],
          ["#contenedor-documentos", "10. Documentos del contenedor (Sección 1)"],
          ["#dashboard", "11. Dashboard"],
          ["#reportes", "12. Reportes"],
          ["#glosario", "13. Glosario"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-muted-foreground hover:text-foreground transition-colors">
            {label}
          </a>
        ))}
      </nav>

      <Section id="intro" title="1. Introducción y flujo general">
        <p>Esta aplicación te permite planificar, simular y hacer seguimiento completo de importaciones desde China. Con ella podés:</p>
        <ul>
          <li><strong>Simular el costo total</strong> de una importación antes de confirmar la compra.</li>
          <li><strong>Gestionar carpetas</strong> (una por importación / proveedor): seguir el estado, cargar fechas clave y documentos.</li>
          <li><strong>Subir documentos en PDF o imagen</strong> — el sistema los lee automáticamente con IA y extrae los datos sin que tengas que tipear nada.</li>
          <li><strong>Agrupar carpetas en contenedores</strong> cuando varios proveedores viajan juntos.</li>
          <li><strong>Comparar estimado vs. real</strong> una vez que llega el despacho de aduana.</li>
        </ul>
        <Callout title="Flujo de una importación paso a paso">
          <ol>
            <li>Crear el proveedor en <strong>Proveedores</strong></li>
            <li>Configurar parámetros globales y NCMs</li>
            <li>Simular → crear carpeta</li>
            <li>Carpeta → Documentos → subir Sección 1 (documentos del proveedor) y Sección 2 (pagos)</li>
            <li>Cuando se cierra el embarque, crear el contenedor y asignar las carpetas</li>
            <li>Contenedor → Documentos → subir Sección 1 (SAF, facturas, despacho de aduana)</li>
            <li>Ver la Sección 3 de la carpeta: comparación estimado vs. real prorrateada automáticamente</li>
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
      </Section>

      <Section id="proveedores" title="3. Proveedores">
        <p>Antes de simular una importación, tenés que tener el proveedor cargado. Accedés desde el menú <strong>Proveedores</strong>.</p>
        <ol>
          <li>Hacé clic en <strong>&ldquo;Nuevo proveedor&rdquo;</strong>.</li>
          <li>Ingresá el nombre del proveedor chino (o del país de origen).</li>
          <li>Guardá.</li>
        </ol>
        <p>Al crear o simular una carpeta vas a poder seleccionarlo desde un desplegable. Podés eliminar un proveedor mientras no tenga carpetas asignadas.</p>
        <Callout title="Información de contacto del proveedor">
          La foto del contacto (tarjeta de visita o captura de WhatsApp) se sube directamente en la carpeta, sección Documentos → Sección 1. No hace falta duplicar esa info aquí.
        </Callout>
      </Section>

      <Section id="parametros" title="4. Parámetros globales">
        <p>Los parámetros globales son los costos fijos del negocio que se aplican a todas las importaciones. Se configuran en el menú <strong>Parámetros</strong>.</p>
        <Table
          headers={["Parámetro", "Descripción", "Ejemplo"]}
          rows={[
            ["TC USD/ARS", "Tipo de cambio dólar-peso", "1.200"],
            ["Flete internacional (USD)", "Costo del flete marítimo/aéreo de referencia.", "3.500"],
            ["Gasto terminal (USD)", "THC, handling, depósito fiscal, etc.", "250"],
            ["Flete interno (USD)", "Transporte puerto-depósito", "400"],
            ["Seguro (%)", "% sobre FOB + Flete", "0,5%"],
            ["Honorarios despachante (%)", "% sobre FOB", "1%"],
            ["Mínimo honorarios (USD)", "Piso del honorario", "450"],
            ["Gastos bancarios (%)", "% sobre CIF", "0,5%"],
          ]}
        />
        <p>Cada actualización crea una <strong>nueva versión</strong> — las carpetas ya creadas mantienen el snapshot original.</p>
      </Section>

      <Section id="ncm" title="5. NCMs (Posiciones Arancelarias)">
        <p>Cada producto importado tiene un <strong>código NCM</strong> de 8 dígitos que determina sus aranceles. Se cargan en el menú <strong>NCMs</strong>.</p>
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
      </Section>

      <Section id="simulador" title="6. Simulador / Nueva Carpeta">
        <p>El simulador calcula el costo total antes de confirmar la compra. Accedés desde <strong>Carpetas → Nueva carpeta</strong>.</p>
        <ol>
          <li>Seleccioná el <strong>proveedor</strong> y el <strong>NCM</strong>.</li>
          <li>Ingresá el <strong>FOB total en USD</strong>, CBM y peso.</li>
          <li>Seleccioná el <strong>tipo de contenedor</strong> y si es <strong>contenedor lleno o proporcional (LCL)</strong>.</li>
          <li>Si tenés el flete cotizado, ingresalo; si no, el sistema usa los parámetros globales.</li>
          <li>Revisá la cascada de costos. Los costos por contenedor (THC, TOLL, depósito fiscal, flete local) se multiplican automáticamente según la cantidad de contenedores calculada.</li>
          <li>Si los números cierran, hacé clic en <strong>&ldquo;Crear carpeta&rdquo;</strong>.</li>
        </ol>
        <Callout title="Factor de contenedor">
          El sistema calcula cuántos contenedores necesitás en función del CBM y el peso. Si el resultado es 1,4 contenedores y elegís &ldquo;contenedor lleno&rdquo;, se redondea a 2. Si elegís &ldquo;proporcional&rdquo;, se usa el factor exacto (útil para grupaje o LCL).
        </Callout>
      </Section>

      <Section id="carpetas" title="7. Gestión de Carpetas">
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
          <li><strong>Resumen</strong> — FOB, CIF estimado, estado, BL (editable), fechas clave incluyendo fechas de pago (se cargan solas al subir los comprobantes).</li>
          <li><strong>SKUs</strong> — Productos con código, cantidad, precio, CBM y peso.</li>
          <li><strong>Costos</strong> — Estimado vs. real con variación.</li>
          <li><strong>Timeline</strong> — Fechas de pago, embarque, ETA, arribo, liberación.</li>
          <li><strong>Documentos</strong> — Ver sección siguiente (8).</li>
        </ul>
      </Section>

      <Section id="carpeta-documentos" title="8. Documentos de la carpeta (Secciones 1, 2 y 3)">
        <p>Dentro de la carpeta, tab <strong>Documentos</strong>, encontrás tres secciones. El sistema lee todos los PDF e imágenes con IA y extrae los datos automáticamente — no hay que tipear nada.</p>

        <p className="font-medium mt-2">Sección 1 · Documentos del proveedor</p>
        <Table
          headers={["Documento", "Qué extrae la IA"]}
          rows={[
            ["Contacto del vendedor", "Imagen de la tarjeta de visita o captura de WhatsApp del proveedor"],
            ["Proforma Invoice", "FOB total, nombre del proveedor, fecha, ítems y precios"],
            ["Packing List", "CBM total, peso bruto/neto, bultos, validación de destinatario PPO Projects"],
            ["Commercial Invoice", "FOB total, validación de destinatario PPO Projects, comparación vs. proforma"],
          ]}
        />
        <Callout title="Validación PPO Projects">
          El sistema verifica automáticamente que el Packing List y la Commercial Invoice tengan como destinatario a <strong>PPO Projects</strong>. Si no lo detecta, te avisa con un cartel de advertencia.
        </Callout>

        <p className="font-medium mt-4">Sección 2 · Pagos al proveedor</p>
        <Table
          headers={["Documento", "Qué extrae la IA"]}
          rows={[
            ["Instrucción transferencia anticipo", "Monto, moneda, beneficiario, banco, SWIFT (opcional)"],
            ["Instrucción transferencia saldo", "Monto, moneda, beneficiario, banco, SWIFT (opcional)"],
            ["Comprobante pago anticipo", "Fecha y monto del pago — se guarda automáticamente en Fechas clave"],
            ["Comprobante pago saldo", "Fecha y monto del pago — se guarda automáticamente en Fechas clave"],
          ]}
        />
        <Callout title="Fechas y montos automáticos">
          Al subir un comprobante de pago, el sistema extrae la fecha y el monto y los guarda directamente en el Resumen de la carpeta. No hace falta cargarlo a mano.
        </Callout>

        <p className="font-medium mt-4">Sección 3 · Comparación estimado vs. real</p>
        <p>Esta sección se completa automáticamente una vez que se sube el despacho de aduana en el contenedor al que pertenece la carpeta. Muestra:</p>
        <ul>
          <li>Tributos reales extraídos del despacho (derechos, IVA, IVA adicional, ganancias, tasa estadística)</li>
          <li>Comparación línea a línea contra la simulación original</li>
          <li>NCM final utilizado en el despacho (puede diferir del NCM original si el despachante lo ajustó)</li>
        </ul>
        <p>El prorrateo entre carpetas se hace automáticamente:</p>
        <ul>
          <li>Si todas las carpetas del contenedor tienen el <strong>mismo NCM</strong>, se prorratean los tributos por <strong>% del FOB</strong> dentro de ese NCM.</li>
          <li>Si los NCM son distintos, el sistema <strong>asocia directamente</strong> cada ítem del despacho a la carpeta que tiene ese NCM.</li>
          <li>Los costos logísticos (flete, THC, etc.) se prorratean por <strong>CBM o peso</strong>.</li>
        </ul>
      </Section>

      <Section id="contenedores" title="9. Contenedores">
        <p>Cuando cerrás una compra y sabés que vas a mandar un embarque, creás el contenedor y le asignás las carpetas que viajan en él (hasta ~10 proveedores distintos por contenedor).</p>
        <Table
          headers={["Tipo", "Uso"]}
          rows={[
            ["40HQ", "Contenedor de 40 pies high cube — el más común para muebles y volumen grande"],
            ["20HQ", "Contenedor de 20 pies high cube"],
            ["Aéreo", "Envío por avión"],
          ]}
        />
        <ol>
          <li>Creá el contenedor con su número, tipo, fecha de zarpe y ETA.</li>
          <li>Desde cada carpeta, asignala al contenedor correspondiente.</li>
          <li>Los costos logísticos a nivel contenedor se prorratean entre las carpetas por CBM, peso, FOB o unidades.</li>
        </ol>
        <p>El <strong>número de BL</strong> se carga en cada carpeta (tab Resumen), no en el contenedor.</p>
      </Section>

      <Section id="contenedor-documentos" title="10. Documentos del contenedor (Sección 1)">
        <p>Dentro del contenedor, tab <strong>Documentos</strong>, está la <strong>Sección 1 · Operación aduanera</strong>. Acá se cargan todos los documentos que llegan cuando el contenedor ya llegó a Argentina y se empieza el despacho.</p>
        <Table
          headers={["Documento", "Qué extrae la IA"]}
          rows={[
            ["SAF (Servicio Almacenaje y Fiscalización)", "N° SAF, despachante, monto total, conceptos"],
            ["Comprobante pago SAF", "Fecha y monto del pago"],
            ["Factura logística", "N° factura, empresa logística (ej: ACW Cargo), monto total, conceptos (flete, THC, handling, etc.)"],
            ["Comprobante pago logística", "Fecha y monto del pago"],
            ["Factura despachante", "N° factura, honorarios y gastos del despachante, N° de despacho"],
            ["Comprobante pago despachante", "Fecha y monto del pago"],
            ["Despacho de aduana", "NCM por ítem, FOB, flete, CIF, derechos de importación, tasa estadística, IVA, IVA adicional, ganancias, total tributos, tipo de cambio oficial"],
          ]}
        />
        <Callout title="El despacho de aduana es el documento más importante">
          Una vez que subís el despacho, el sistema extrae todos los tributos reales ítem por ítem y los prorrateas automáticamente entre las carpetas del contenedor. Así podés ver en cada carpeta cuánto pagaste realmente de impuestos vs. lo que habías estimado en la simulación.
        </Callout>
        <p>Debajo de los slots de documentos, al cargar el despacho, aparece un <strong>resumen de tributos reales</strong> con los totales del contenedor (FOB USD, CIF USD, derechos ARS, IVA ARS, etc.).</p>
      </Section>

      <Section id="dashboard" title="11. Dashboard">
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

      <Section id="reportes" title="12. Reportes">
        <Table
          headers={["Reporte", "Para qué sirve"]}
          rows={[
            ["Costos por carpeta", "Detalle de estimado vs. real por importación, exportable a PDF o Excel"],
            ["Comparativo estimado/real", "Dónde se generan las diferencias más grandes entre lo calculado y lo real"],
          ]}
        />
      </Section>

      <Section id="glosario" title="13. Glosario">
        <Table
          headers={["Término", "Significado"]}
          rows={[
            ["FOB", "Free On Board. Precio de la mercadería en el puerto de origen, sin flete ni seguro."],
            ["CIF", "Cost, Insurance and Freight. FOB + flete + seguro. Base para calcular impuestos en Argentina."],
            ["CBM", "Cubic Meter. Metros cúbicos de la mercadería."],
            ["NCM", "Nomenclatura Común del Mercosur. Código de 8 dígitos que clasifica el producto y determina sus aranceles."],
            ["Despacho", "El trámite aduanero para liberar la mercadería. Lo hace el despachante de aduana."],
            ["SAF", "Servicio de Almacenaje y Fiscalización. Nota de gastos del despachante por depósito y control en aduana."],
            ["Tasa estadística", "Arancel cobrado por AFIP/INDEC sobre el CIF. Solo aplica a algunos NCMs."],
            ["Prorrateo", "Dividir un costo común entre varias carpetas o SKUs según CBM, peso, FOB o unidades."],
            ["Snapshot", "Fotografía de los parámetros al crear la carpeta. Garantiza que los cálculos no cambien si después actualizás los parámetros."],
            ["FCL", "Full Container Load. Contenedor completo exclusivo para tu carga."],
            ["LCL", "Less than Container Load. Grupaje: compartís el contenedor con otras cargas."],
            ["BL", "Bill of Lading (conocimiento de embarque). Documento que emite la naviera."],
            ["ETA", "Estimated Time of Arrival. Fecha estimada de llegada al puerto."],
            ["PPO Projects", "Tu empresa importadora. Los documentos del proveedor deben consignar este nombre como destinatario."],
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
