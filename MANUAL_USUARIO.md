# Manual de Usuario — Sistema de Gestión de Importaciones

> **Versión:** Junio 2026 | **Orientado a:** usuarios no técnicos que gestionan importaciones desde China

---

## 1. Introducción

Esta aplicación te permite planificar, simular y hacer seguimiento de importaciones desde China. Con ella podés:

- **Simular el costo total** de una importación antes de confirmar la compra (cuánto te va a costar realmente cada producto puesto en Argentina).
- **Gestionar carpetas** (una por importación): seguir el estado, cargar fechas clave, subir documentos.
- **Registrar los costos reales** cuando llega la liquidación del despachante y comparar con lo estimado.
- **Ver un dashboard** con todas las operaciones en curso y sus alertas.

### Flujo general de una importación

```
1. Configurar parámetros globales (TC, fletes, etc.)
2. Cargar el NCM de la mercadería (con sus aranceles)
3. Simular → crear carpeta
4. Seguir el avance: pre-embarque → en tránsito → en aduana → finalizada
5. Subir la liquidación del despachante y confirmar costos reales
```

---

## 2. Primeros pasos

### Cómo ingresar

Accedé a la URL de la aplicación e ingresá con tu usuario y contraseña. Si es tu primer ingreso, el administrador ya habrá creado tu cuenta.

### Roles de usuario

| Rol | Qué puede hacer |
|-----|----------------|
| **Admin** | Todo: parámetros, NCMs, carpetas, reportes |
| **Operador** | Carpetas, NCMs, simulaciones |
| **Viewer** | Solo lectura |

### Recomendación de seguridad

Cambiá tu contraseña la primera vez que ingresás. Podés hacerlo desde el panel de tu cuenta en Supabase (pedile el link al administrador).

---

## 3. Parámetros globales

Los parámetros globales son los costos fijos del negocio que se aplican a todas las importaciones. Se configuran en el menú **Parámetros**.

### Qué incluyen

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| **TC USD/ARS** | Tipo de cambio dólar-peso | 1.200 |
| **Gasto terminal (USD)** | Costo fijo portuario | 250 |
| **Flete interno (USD)** | Transporte puerto-depósito | 400 |
| **Seguro (%)** | % sobre FOB + Flete | 0,5% |
| **Honorarios despachante (%)** | % sobre FOB | 1% |
| **Mínimo honorarios (USD)** | Piso del honorario | 450 |
| **Gastos bancarios (%)** | % sobre CIF | 0,5% |

### Cuándo actualizarlos

- Cuando cambia el tipo de cambio significativamente.
- Cuando cambia el costo del flete interno o del terminal portuario.
- Cuando acordás nuevos honorarios con el despachante.

### Importante: los parámetros son inmutables

Una vez que se usa una versión de parámetros en una carpeta, esa versión queda "congelada" (snapshot). Si actualizás los parámetros, **las carpetas anteriores no se modifican**. Esto es intencional: garantiza que los costos estimados originales queden preservados.

Para actualizar, simplemente hacé clic en **"Crear nueva versión"** con los nuevos valores. La nueva versión se aplica automáticamente a las carpetas que crees a partir de ese momento.

---

## 4. NCMs (Posiciones Arancelarias)

Cada producto importado tiene un **código NCM** (Nomenclatura Común del Mercosur) que determina qué impuestos se pagan. Se configuran en el menú **NCMs**.

### Cómo cargar un NCM nuevo

1. Clic en **"Nuevo NCM"**.
2. Completá el **código NCM** (ej: `9403.20.00` para muebles de madera).
3. Agregá una descripción opcional.
4. Completá los aranceles (ver tabla abajo).
5. Guardá.

### Campos del NCM

| Campo | Descripción | Valor típico |
|-------|-------------|-------------|
| **Derecho de importación (%)** | El arancel principal sobre el valor CIF | 20% (varía por producto) |
| **IVA (%)** | IVA de importación. La mayoría paga 21%, algunos productos esenciales 10,5% | 21% |
| **IVA adicional (%)** | Percepción extra de IVA, si aplica para ese NCM | 20% |
| **Anticipo ganancias (%)** | Percepción de ganancias, si aplica | 6% |
| **IIBB (%)** | Ingresos brutos de importación, si aplica | 2,5% |
| **Tasa estadística (%)** | Tasa cobrada por estadísticas de comercio exterior | 3% |

Para IVA adicional, anticipo ganancias, IIBB y tasa estadística: primero marcás el checkbox "Aplica", y recién entonces aparece el campo para ingresar el porcentaje.

**Ejemplo:** Para el NCM `9403.20.00` (muebles), los valores típicos son: derecho de importación 20%, IVA 21%, IVA adicional 20% (aplica), anticipo ganancias 6% (aplica), IIBB 0% (no aplica), tasa estadística 3% (aplica).

### Cómo editar un NCM

Si cambia un arancel (por ejemplo, el gobierno modifica el derecho de importación), buscá el NCM en la lista y hacé clic en **"Editar"**. Los cambios se aplican a simulaciones futuras; las carpetas ya creadas mantienen sus valores originales.

---

## 5. Simulador / Nueva Carpeta

El simulador calcula el **costo total de la importación** antes de confirmar la compra. Accedés desde **Carpetas → Nueva carpeta**.

### Paso a paso

**Paso 1 — Datos de la mercadería**
- Seleccioná el **proveedor** (o creá uno nuevo).
- Elegí el **NCM** de la lista.
- Ingresá el **FOB total en USD** (ej: `10.000`): es el valor de la mercadería en fábrica/puerto de origen.
- Ingresá **CBM** (metros cúbicos) y **peso en kg** si los tenés.

**Paso 2 — Logística**
- Seleccioná el **tipo de contenedor**: FCL 20', FCL 40', FCL 40'HC, LCL (grupaje) o Aéreo.
- Si ya tenés el flete internacional cotizado, ingresalo. Si no, el sistema usa el gasto terminal + flete interno de los parámetros.

**Paso 3 — Revisar la cascada de costos**

El sistema calcula automáticamente:

```
FOB:                        USD 10.000
+ Flete:                    USD    650
+ Seguro (0,5%):            USD     53
= CIF:                      USD 10.703
+ Derecho importación (20%):USD  2.141
+ Tasa estadística (3%):    USD    321
= Base imponible IVA:       USD 13.165
+ IVA (21%):                USD  2.765
+ IVA adicional (20%):      USD  2.633
+ Anticipo ganancias (6%):  USD    790
+ Honorarios despachante:   USD    450  (mínimo)
+ Gastos bancarios (0,5%):  USD     54
= TOTAL COSTOS:             USD 19.073
= COSTO TOTAL:              USD 29.073 (FOB + costos)
```

Estos números te permiten calcular el costo de desembarco por unidad y decidir si la operación es rentable.

**Paso 4 — Crear la carpeta**

Si los números cierran, hacé clic en **"Crear carpeta"**. El sistema guarda la simulación como una carpeta en estado **"Simulación"**.

---

## 6. Gestión de Carpetas

Las carpetas son el corazón de la app. Cada importación tiene su propia carpeta con toda la información. Accedés desde el menú **Carpetas**.

### Estados de una carpeta

| Estado | Qué significa |
|--------|--------------|
| **Simulación** | Solo estimación, todavía no se confirmó la compra |
| **Pre-embarque** | La compra está confirmada, esperando que el proveedor embarque |
| **En tránsito** | La mercadería está en el barco |
| **En aduana** | Llegó al puerto, el despachante está gestionando el despacho |
| **Finalizada** | La mercadería fue liberada y llegó al depósito |

Para avanzar el estado, entrá a la carpeta y usá el botón de cambio de estado.

### Tabs dentro de una carpeta

**Resumen** — Vista general: datos del proveedor, NCM, FOB, contenedor asignado, estado actual, montos de pago.

**SKUs** — Lista de productos dentro de la importación. Podés cargar cada artículo con código, descripción, cantidad, precio unitario FOB, peso y CBM. Útil para prorratear costos por producto.

**Costos** — Detalle de todos los costos estimados (generados por el simulador) y los costos reales (cargados al subir la liquidación). Podés agregar costos manuales si surge algo imprevisto.

**Timeline** — Fechas clave de la operación:

| Hito | Cuándo cargarlo |
|------|----------------|
| Pago anticipo | Cuando hacés la transferencia del anticipo |
| Embarque | Cuando el proveedor confirma la fecha de carga |
| ETA (estimada) | La fecha de llegada que da la naviera |
| Arribo real | Cuando el barco llega al puerto |
| Liberación | Cuando la aduana libera la mercadería |
| Llegada a oficina | Cuando la mercadería llega a tu depósito |

**Documentos** — Subí los documentos de la operación: factura comercial, packing list, BL (conocimiento de embarque), certificados, etc.

---

## 7. Dashboard

El dashboard muestra todas las operaciones activas en formato **kanban** (columnas por estado). Accedés desde el menú **Dashboard**.

### Cómo leerlo

Cada tarjeta representa una carpeta y muestra:
- Número de carpeta y proveedor
- FOB total
- Días transcurridos desde el último hito

### Alertas de color

| Color | Significado |
|-------|-------------|
| **Verde** | Todo en orden |
| **Amarillo** | Atención: algún plazo se está acercando |
| **Rojo** | Alerta: hay una fecha vencida o la operación tiene más días de los esperados sin movimiento |

---

## 8. Contenedores

Los contenedores se usan cuando agrupás varias carpetas en un mismo envío. Accedés desde el menú **Contenedores**.

### Cuándo crear un contenedor

- Cuando confirmás que varias importaciones van a viajar juntas en el mismo barco.
- Para un FCL (contenedor completo), generalmente hay una sola carpeta por contenedor.
- Para LCL (grupaje), puede haber varias carpetas de distintos proveedores en el mismo contenedor.

### Cómo asignar carpetas a un contenedor

1. Creá el contenedor con los datos del barco (número de contenedor, naviera, BL, fecha de zarpe, ETA).
2. Desde cada carpeta, asignala al contenedor correspondiente.

### Prorrateo de costos

Si un costo aplica al contenedor completo (por ejemplo, el flete internacional del FCL), podés registrarlo a nivel contenedor y prorratear entre las carpetas. El sistema divide el costo según el criterio que elijas: CBM, peso, FOB o unidades.

---

## 9. Extracción de liquidación del despachante (PDF)

Cuando el despachante te manda la **liquidación de importación** (documento donde detalla todos los impuestos y gastos que pagó), podés subirla para comparar los costos reales con los estimados.

### Cómo hacerlo

1. Entrá a la carpeta correspondiente → tab **Costos**.
2. Buscá la opción **"Subir liquidación PDF"**.
3. Seleccioná el archivo PDF de la liquidación.
4. El sistema extrae automáticamente los conceptos y montos del PDF.
5. Revisá la comparación **estimado vs. real**:
   - Si los valores parecen correctos, confirmá.
   - Si algo no coincide, podés editarlo manualmente antes de confirmar.
6. Al confirmar, los costos reales quedan registrados en la carpeta.

### Qué hacer si el PDF no se lee bien

Algunos PDFs escaneados (imágenes) no se pueden extraer automáticamente. En ese caso, cargá los costos reales manualmente desde el tab Costos → "Agregar costo".

---

## 10. Reportes

Accedés desde el menú **Reportes**. Disponibles:

| Reporte | Para qué sirve |
|---------|---------------|
| **Costos por carpeta** | Ver el detalle de estimado vs. real por cada importación |
| **Carpetas por estado** | Cuántas operaciones hay en cada etapa |
| **Comparativo estimado/real** | Dónde se generan las diferencias más grandes entre lo que calculaste y lo que terminó costando |

Usá estos reportes para mejorar las estimaciones futuras: si siempre el IVA adicional está más alto de lo estimado, revisá el % en el NCM.

---

## 11. Glosario

| Término | Significado |
|---------|-------------|
| **FOB** | Free On Board. El precio de la mercadería puesta en el puerto de origen (sin flete ni seguro). Es el valor sobre el que se negocia con el proveedor chino. |
| **CIF** | Cost, Insurance and Freight. FOB + flete internacional + seguro. Es la base sobre la que se calculan los impuestos de importación en Argentina. |
| **CBM** | Cubic Meter. Metros cúbicos de la mercadería. Determina el espacio que ocupa en el contenedor. |
| **NCM** | Nomenclatura Común del Mercosur. El código de 8 dígitos que clasifica cada tipo de producto y determina sus aranceles. Ej: 9403.20.00 = muebles de madera. |
| **Despacho / Despachar** | El trámite aduanero para liberar la mercadería. Lo hace el despachante de aduana. |
| **Despachante de aduana** | El profesional matriculado que gestiona el trámite ante la AFIP para liberar la mercadería. Cobra honorarios por su trabajo. |
| **Tasa estadística** | Un arancel cobrado por AFIP/INDEC sobre el CIF, para financiar las estadísticas de comercio exterior. Solo aplica a algunos NCMs. |
| **Prorrateo** | Dividir un costo común (ej: flete) entre varias carpetas o SKUs en proporción a su peso, CBM, FOB o unidades. |
| **Snapshot** | Fotografía de los parámetros al momento de crear la carpeta. Garantiza que los cálculos originales no cambien aunque después actualicés los parámetros. |
| **FCL** | Full Container Load. Contenedor completo exclusivo para tu carga. |
| **LCL** | Less than Container Load. Grupaje: compartís el contenedor con otras cargas. |
| **BL** | Bill of Lading (conocimiento de embarque). El documento que emite la naviera y acredita que la mercadería está en el barco. |
| **ETA** | Estimated Time of Arrival. Fecha estimada de llegada al puerto de destino. |
| **Liquidación del despachante** | El documento que presenta el despachante con el detalle de todos los impuestos y gastos que pagó para liberar la mercadería. |
