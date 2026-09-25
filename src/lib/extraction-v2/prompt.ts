import { z } from "zod";

import { invoiceExtractionSchema, taxBreakdownLineSchema } from "@/lib/schemas";

/**
 * Mismos campos y tipos que `invoiceExtractionSchema` (el resto del sistema no cambia), pero
 * con descripciones SIN números de ejemplo: con gpt-4o los ejemplos del prompt terminaban
 * copiados en la salida cuando el dato no estaba en el documento.
 */
export const invoiceExtractionSchemaV2 = invoiceExtractionSchema.extend({
  provider: z.string().nullable().describe("Razón social del EMISOR (quien vende y factura), no del cliente."),
  cuit: z
    .string()
    .nullable()
    .describe("CUIT del EMISOR, 11 dígitos con formato XX-XXXXXXXX-X. null si el emisor no tiene CUIT impreso."),
  invoice_date: z.string().nullable().describe("Fecha de emisión del comprobante, YYYY-MM-DD."),
  invoice_number: z
    .string()
    .nullable()
    .describe(
      "Número del comprobante. Con punto de venta impreso: PPPPP-NNNNNNNN (5 + 8 dígitos, con ceros a la izquierda). Sin punto de venta: el número tal cual está impreso.",
    ),
  invoice_type: z.string().nullable().describe("Letra del comprobante (A, B, C, M, E, R) o null si no tiene letra."),
  afip_comprobante_code: z
    .string()
    .nullable()
    .describe("Código de comprobante ARCA impreso junto a la letra ('Cód.'), o null si no está impreso."),
  fiscal_auth_code: z.string().nullable().describe("Número de CAE, CAEA o CAI, solo dígitos."),
  document_title: z.string().nullable().describe("Título principal impreso del documento, o null."),
  vat_amount: z.number().nullable().describe("Total de IVA discriminado. null si el comprobante no discrimina IVA."),
  discount_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe("Bonificaciones o descuentos GLOBALES del pie con importe (en positivo). null si no hay."),
  exchange_rate: z
    .number()
    .nullable()
    .describe("Pesos por dólar, solo si el comprobante informa un tipo de cambio. null si no."),
  confidence: z.number().min(0).max(1).describe("Tu confianza real (0 a 1) en que todos los campos son correctos."),
});

export const EXTRACTION_SYSTEM_PROMPT_V2 = `Sos un experto en comprobantes comerciales y fiscales de Argentina. Extraé los datos del documento con precisión absoluta: cada dígito importa porque se carga en la contabilidad.

Reglas generales
- Devolvé SOLO lo que está impreso en el documento. Si un dato no figura o no es legible, devolvé null. Nunca completes con valores inventados, de ejemplo ni de otro documento.
- Las imágenes pueden ser varias páginas o partes del MISMO comprobante: combinalas. También recibís ampliaciones de la cabecera y del pie para leer la letra chica. Las páginas pueden estar giradas o fotografiadas en ángulo: leelas igual.
- Formato numérico argentino: punto = miles, coma = decimales. Devolvé números sin separadores de miles y con punto decimal.

Emisor vs. cliente
- El EMISOR es quien vende y emite el comprobante: su razón social, CUIT, ingresos brutos e inicio de actividades suelen estar en el encabezado, junto al logo o al recuadro de la letra.
- El bloque "Señor/es", "Cliente", "Razón social del cliente" o el CUIT que acompaña al domicilio del comprador es del CLIENTE: nunca lo uses como CUIT del emisor.
- Si el único CUIT legible es el del cliente, cuit = null.

Número, fecha, letra y autorización
- invoice_number: combiná punto de venta y número del comprobante (no el del remito, pedido, orden de compra, cliente ni CAE).
- invoice_type: la letra grande del recuadro central (A, B, C, M, E; R en remitos). null en presupuestos, notas de pedido y partes diarios.
- fiscal_auth: CAE / CAEA (comprobantes electrónicos) o CAI (comprobantes de imprenta y remitos) con su número, normalmente al pie. TICKET_FISCAL para controladores fiscales.
- document_kind: FACTURA, NOTA_CREDITO, NOTA_DEBITO, REMITO, o PRESUPUESTO (presupuesto, nota de pedido, parte diario u orden interna sin autorización fiscal).

Importes (del recuadro de totales)
- net_amount = neto gravado / subtotal sin IVA; vat_amount = total de IVA (vat_lines por alícuota); perceptions_amount = total de percepciones (perception_lines, kind IVA o IIBB según el concepto del renglón, aunque esté dentro de un bloque titulado de otra forma); total_amount = importe final.
- Algunos comprobantes rotulan el total final como "TOTAL NETO": es el total si coincide con la suma.
- Si el comprobante no discrimina IVA (B o C sin desglose), devolvé total_amount y dejá net_amount y vat_amount en null. Si informa "IVA contenido", usalo.
- discount_lines: solo bonificaciones o descuentos GLOBALES del pie con importe (en positivo), no los descuentos por renglón ya incluidos en el subtotal.
- Si la moneda del comprobante es USD, devolvé los importes en USD e informá exchange_rate si figura.
- Si el recuadro de totales no está en las imágenes (por ejemplo, falta la última hoja), los importes van null.

Verificá tu lectura antes de responder (hacelo internamente)
1. net_amount + vat_amount + perceptions_amount = total_amount (tolerancia de centavos). Si no cierra, releé los dígitos dudosos hasta que cierre.
2. El CUIT tiene dígito verificador: con pesos 5,4,3,2,7,6,5,4,3,2 sobre los 10 primeros dígitos, v = 11 - (suma mod 11); si v = 11 el verificador es 0. Si tu lectura no verifica, releé ese dígito por dígito.
3. En comprobantes electrónicos el código de barras (o su número impreso debajo) contiene: CUIT del emisor (11) + código de comprobante + punto de venta + CAE (14) + vencimiento del CAE (AAAAMMDD) + dígito verificador. Usalo para confirmar CUIT, punto de venta y CAE.
4. El vencimiento del CAE suele ser la fecha de emisión + 10 días: sirve para desambiguar una fecha tachada o borrosa.
5. Si recibís "datos decodificados del QR/código de barras de ARCA", son exactos: usalos como verdad.`;
