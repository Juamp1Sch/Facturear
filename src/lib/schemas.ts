import { z } from "zod";

/** Renglón del desglose de IVA o percepciones en el comprobante. */
export const taxBreakdownLineSchema = z.object({
  label: z
    .string()
    .nullable()
    .describe(
      "Texto del renglón en la factura (ej. IVA 21%, Percepción IIBB CABA, Percepción IVA)",
    ),
  amount: z.number().describe("Importe en pesos de ese renglón"),
});

export type TaxBreakdownLine = z.infer<typeof taxBreakdownLineSchema>;

/** Structured extraction from OCR text (Argentina-style invoices). */
export const invoiceExtractionSchema = z.object({
  provider: z
    .string()
    .nullable()
    .describe("Razón social del EMISOR / vendedor (membrete), no del cliente"),
  cuit: z
    .string()
    .nullable()
    .describe(
      "CUIT del EMISOR: solo cabecera/membrete (11 dígitos, formato XX-XXXXXXXX-X). Nunca cliente/receptor. Si hay 11 dígitos legibles en cabecera, devolverlos aunque exista otro CUIT en el cuerpo; no null por cautela AFIP.",
    ),
  invoice_date: z
    .string()
    .nullable()
    .describe("Fecha de emisión del comprobante (recuadro FECHA), ISO YYYY-MM-DD"),
  invoice_number: z
    .string()
    .nullable()
    .describe(
      "Número de comprobante AFIP. Si en cabecera (recuadro superior derecho, junto a FACTURA A/B/C) aparecen Punto de Venta y Número por separado, devolvé UN solo string NNNNN-NNNNNNNN: 5 dígitos de punto de venta + guion + 8 dígitos de número, con ceros a la izquierda (ej. PV 4 y Nro 59991 → 00004-00059991). Si solo hay un número sin punto de venta, devolvé ese valor legible sin inventar PV. No uses CAE, OC, códigos de ítem ni números de cliente.",
    ),
  invoice_type: z
    .string()
    .nullable()
    .describe("Tipo de comprobante AFIP: A, B, C, M, E, etc."),
  afip_comprobante_code: z
    .string()
    .nullable()
    .describe(
      "Código de comprobante AFIP/ARCA impreso en el documento: el recuadro 'Cód. NN' / 'Código NN' (1 a 3 dígitos) que figura junto a la letra A/B/C en comprobantes fiscales electrónicos o de imprenta (ej. 01, 06, 011). SOLO devolvé este número si está realmente impreso como código de comprobante AFIP. Devolvé null si el documento es un presupuesto, nota de pedido, parte diario, remito interno u orden de compra SIN ese recuadro de código AFIP. No confundir con número de comprobante, CAE, CAI, CAEA, punto de venta, código de artículo ni teléfono.",
    ),
  fiscal_auth_type: z
    .enum(["CAE", "CAEA", "CAI", "TICKET_FISCAL"])
    .nullable()
    .describe(
      "Tipo de autorización fiscal detectada en el documento. CAE: comprobante electrónico con 'CAE N°' y 'Vto. CAE' al pie. CAEA: comprobante con 'CAEA' al pie. CAI: comprobante de imprenta/remito fiscal con 'CAI:' y 'Fecha Vencimiento' (típicamente esquina inferior derecha o pie). TICKET_FISCAL: ticket de controlador fiscal ('C.F.', 'Controlador Fiscal', 'TIQUE', 'Tique Factura'). null si no hay ninguna autorización fiscal legible (presupuesto, nota de pedido interna, etc.).",
    ),
  fiscal_auth_code: z
    .string()
    .nullable()
    .describe(
      "Número de la autorización fiscal leída (CAE, CAEA o CAI). Solo dígitos o el valor tal como aparece impreso (ej. 52076217180318). null si fiscal_auth_type es TICKET_FISCAL o no hay número legible.",
    ),
  document_title: z
    .string()
    .nullable()
    .describe(
      "Título o encabezado principal del documento tal como está impreso en grande (ej. PARTE DIARIO, PRESUPUESTO, FACTURA A, ORDEN DE COMPRA, NOTA DE PEDIDO). null si no hay título claro.",
    ),
  document_kind: z
    .enum(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "REMITO", "PRESUPUESTO"])
    .nullable()
    .describe(
      "Tipo de documento según encabezado: FACTURA, NOTA_CREDITO, NOTA_DEBITO, REMITO (remito fiscal o de entrega), PRESUPUESTO (presupuesto, nota de pedido, parte diario u orden interna sin CAE/CAI/CAEA). Si hay CAE/CAI/CAEA es comprobante fiscal, no PRESUPUESTO.",
    ),
  net_amount: z
    .number()
    .nullable()
    .describe(
      "Importe neto gravado (sin IVA). Suele aparecer como 'Subtotal', 'Neto gravado' o 'Importe neto' en el recuadro de totales. Debe cumplir: net_amount + vat_amount + perceptions_amount ≈ total_amount.",
    ),
  vat_amount: z
    .number()
    .nullable()
    .describe(
      "Total de IVA del comprobante. Debe coincidir con la suma de vat_lines si las devolvés. Formato numérico interno: 1227.55 (sin separadores).",
    ),
  vat_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe(
      "Cada renglón de IVA del desglose fiscal (pie de factura, tabla de impuestos). Un elemento por alícuota o importe de IVA legible.",
    ),
  perceptions_amount: z
    .number()
    .nullable()
    .describe(
      "Total de percepciones impositivas (IIBB, percepción IVA, etc.). Debe coincidir con la suma de perception_lines si las devolvés.",
    ),
  perception_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe(
      "Cada percepción por separado (IIBB, percepción IVA, etc.) con su importe. null si no hay percepciones.",
    ),
  discount_amount: z
    .number()
    .nullable()
    .describe(
      "Total de bonificaciones/descuentos del comprobante en POSITIVO (magnitud). Suma de discount_lines si las devolvés. NO entra en net+IVA+percepciones≈total.",
    ),
  discount_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe(
      "Cada bonificación o descuento con importe > 0 (ej. BONIFICACION GENERAL, BONIFICACION ESPECIAL, Descuento). Devolvé amount en POSITIVO aunque esté impreso negativo. null si no hay bonificaciones.",
    ),
  total_amount: z
    .number()
    .nullable()
    .describe(
      "Importe total final a pagar del comprobante. Debe ser ≈ net_amount + vat_amount + perceptions_amount (+ otros tributos si los hubiera).",
    ),
  chart_account_code: z
    .string()
    .nullable()
    .describe(
      "Código de cuenta del plan importado (columna Cuenta: ej. 1001 Efectivo, 2007 Galicia). Solo si hay plan cargado y hay señal en el comprobante.",
    ),
  confidence: z.number().min(0).max(1).describe("Confianza global 0-1"),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

/** Extracción focalizada de autorización fiscal (pie / esquina inferior). */
export const fiscalAuthSupplementSchema = z.object({
  fiscal_auth_type: z
    .enum(["CAE", "CAEA", "CAI", "TICKET_FISCAL"])
    .nullable()
    .describe(
      "CAE, CAEA, CAI o TICKET_FISCAL si aparece en el pie o esquina inferior del comprobante. null si no hay.",
    ),
  fiscal_auth_code: z
    .string()
    .nullable()
    .describe("Número de CAE, CAEA o CAI (solo dígitos). null para ticket o si no se lee."),
});

export type FiscalAuthSupplement = z.infer<typeof fiscalAuthSupplementSchema>;

/** Extracción focalizada del recuadro de totales (segunda pasada de visión). */
export const amountsSupplementSchema = z.object({
  net_amount: z
    .number()
    .nullable()
    .describe(
      "Subtotal / neto gravado del recuadro de totales (sin IVA ni percepciones).",
    ),
  vat_amount: z
    .number()
    .nullable()
    .describe("Total IVA del recuadro de totales."),
  vat_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe("Desglose de IVA si aparece en el recuadro de totales."),
  perceptions_amount: z
    .number()
    .nullable()
    .describe(
      "Total percepciones del recuadro derecho: 'Total Percep. IIBB', 'Percepciones IIBB', etc.",
    ),
  perceptions_amount_secondary: z
    .number()
    .nullable()
    .describe(
      "Segunda aparición de percepciones IIBB en la caja 'Saldo en cuenta' / desglose inferior izquierdo ('Perc IIBB Buenos Aires', etc.). Debe coincidir con perceptions_amount; si difieren, devolvé ambos tal cual los leés.",
    ),
  perception_lines: z
    .array(taxBreakdownLineSchema)
    .nullable()
    .describe("Desglose de percepciones si aparece en el recuadro."),
  total_amount: z
    .number()
    .nullable()
    .describe("Total final del recuadro de totales."),
});

export type AmountsSupplement = z.infer<typeof amountsSupplementSchema>;

/** Extracción focalizada de bonificaciones / descuentos (segunda pasada de visión). */
export const discountLineSupplementSchema = z.object({
  label: z
    .string()
    .nullable()
    .describe(
      'Texto del renglón (ej. "BONIFICACION GENERAL", "BONIFICACION ADICIONAL").',
    ),
  percentage: z
    .number()
    .describe(
      "Porcentaje impreso en la fila (ej. 20 para 20,00 %; 10,5 para 10,50 %). Leé SOLO el porcentaje, no el importe.",
    ),
});

export const discountSupplementSchema = z.object({
  discount_lines: z
    .array(discountLineSupplementSchema)
    .nullable()
    .describe(
      "Cada fila de bonificación con su porcentaje. UN elemento por renglón visible (ej. 7 filas → 7 objetos). NO leas ni devuelvas importes en dinero.",
    ),
});

export type DiscountSupplement = z.infer<typeof discountSupplementSchema>;
