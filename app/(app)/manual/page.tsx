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
          ["#contenedor-documentos", "10. Documentos del contenedor"],
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
            <li>Simular → crear carpeta (queda en estado Simulación)</li>
            <li>Carpeta → Documentos → subir Proforma Invoice y Packing List (la app crea los SKUs automáticamente con nombres en español)</li>
            <li>Carpeta → Documentos → subir comprobantes de pago al proveedor</li>
            <li>Cuando se confirma el embarque, crear el contenedor y asignar las carpetas indicando el CBM de cada una</li>
            <li>Contenedor → Documentos → subir Factura naviera, Factura despachante y Despacho de Importación (DI)</li>
            <li>Al subir el DI, la app asigna automáticamente los impuestos a cada carpeta y SKU — no hay pasos manuales adicionales</li>
            <li>Ver pestaña SKUs de cada carpeta: costo unitario real por producto</li>
            <li>Ver pestaña Costos: comparación estimado vs. real con varianza</li>
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
          <li><strong>SKUs</strong> — Los nombres de los SKUs se traducen automáticamente al español al subir la Proforma Invoice o el Packing List. Cada SKU muestra: nombre en español, código original del proveedor, cantidad, FOB unitario, CBM, costo total estimado y real, costo unitario estimado y real, y si paga antidumping (detectado automáticamente del DI).</li>
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
        <p>Esta sección se completa automáticamente una vez que se sube el Despacho de Importación en el contenedor correspondiente. No hay que hacer nada manual. Muestra la comparación línea a línea de cada costo estimado vs. real con la varianza en porcentaje.</p>
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

      <Section id="contenedor-documentos" title="10. Documentos del contenedor">
        <p>Dentro del contenedor, tab <strong>Documentos</strong>, se cargan todos los documentos compartidos entre las carpetas del envío. Al subir cada documento, la app extrae los datos automáticamente y actualiza los costos de todas las carpetas del contenedor — sin pasos manuales adicionales.</p>
        <Table
          headers={["Documento", "Qué hace la app automáticamente"]}
          rows={[
            ["Aviso de arribo", "Extrae fecha de arribo estimada y real"],
            ["Factura naviera", "Extrae flete, seguro, THC, TOLL, gastos locales, consolidado. Los prorratea por CBM entre las carpetas. Excluye el IVA de servicios (es crédito fiscal, no es costo)."],
            ["Comprobante pago naviera", "Registra fecha y monto del pago"],
            ["Factura despachante", "Extrae honorarios, digitalización, tramitaciones, gastos operativos, depósito fiscal, flete local, gastos bancarios. Los prorratea por CBM o FOB según corresponde."],
            ["Comprobante pago despachante", "Registra fecha y monto del pago"],
            ["Despacho de Importación (DI)", "El más importante. Extrae los impuestos de cada ítem (derechos, tasa estadística, antidumping, IVA). Asigna cada ítem a la carpeta y SKU correcto usando IA. Calcula el costo por SKU. Marca automáticamente cuáles pagan antidumping."],
            ["VEP AFIP", "Comprobante del pago de impuestos aduaneros"],
          ]}
        />
        <Callout title="El Despacho de Importación (DI) — flujo automático">
          Al subir el DI, la app: (1) extrae todos los ítems con sus impuestos en USD, (2) usa IA para asignar cada ítem a la carpeta y SKU correcto, (3) calcula y guarda los costos reales en cada carpeta, (4) marca automáticamente qué SKUs pagan antidumping. Si la IA asigna algún ítem con baja confianza, aparece un banner de alerta en el contenedor para que el comprador revise esa asignación.
        </Callout>
        <p className="font-medium mt-4">Criterios de prorrateo</p>
        <Table
          headers={["Costo", "Criterio", "Alcance"]}
          rows={[
            ["Flete, THC, TOLL, depósito fiscal, flete local, gastos locales, consolidado", "CBM", "Todos los ítems del contenedor"],
            ["Honorarios despachante, gastos bancarios, seguro", "% del FOB", "Todos los ítems del contenedor"],
            ["Derechos, tasa estadística, antidumping, IVA aduanero", "Directo por ítem del DI", "Por SKU según NCM"],
          ]}
        />
      </Section>

      <Section id="dashboard" title="11. Dashboard">
        <p>El dashboard muestra todas las importaciones activas en formato kanban (columnas por estado). Diseñado para que la gerencia vea el estado del negocio de un vistazo.</p>
        <p className="font-medium mt-2">Métricas del encabezado</p>
        <Table
          headers={["Métrica", "Qué muestra"]}
          rows={[
            ["Carpetas activas", "Importaciones que no están finalizadas"],
            ["FOB en tránsito", "Total de mercadería en camino en USD"],
            ["Próximo arribo", "Qué importación llega primero y en cuántos días"],
            ["Varianza promedio", "Si los costos reales están por encima o debajo del estimado"],
          ]}
        />
        <p className="font-medium mt-4">Alertas</p>
        <Table
          headers={["Alerta", "Significado"]}
          rows={[
            ["Borde rojo en la card", "La ETA venció y la carpeta no está finalizada"],
            ["Badge “ETA VENCIDA”", "El barco debería haber llegado pero no hay arribo registrado"],
            ["Badge “SOBRECOSTE”", "Los costos reales superan en más de 10% al estimado"],
            ["Banner amarillo en contenedor", "Hay ítems del DI con baja confianza — revisar la asignación"],
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
            ["PPO Projects", "Empresa intermediaria que realiza los pagos a proveedores chinos. No cobra comisión adicional."],
            ["DI", "Despacho de Importación. Documento oficial de AFIP con los impuestos pagados por cada producto."],
            ["Antidumping", "Impuesto especial que pagan ciertos productos para proteger la industria local. Se detecta automáticamente del DI."],
            ["Crédito fiscal", "El IVA de facturas de naviera y despachante que CAC recupera ante AFIP. No es un costo real de la importación."],
            ["SKU", "Stock Keeping Unit. Cada variante de producto dentro de una importación."],
            ["Varianza", "Diferencia porcentual entre el costo estimado y el real. Verde = costó menos, rojo = costó más."],
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
