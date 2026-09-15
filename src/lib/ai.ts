import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { acceptFiscalAuthSupplement } from "@/lib/document-class";
import { withOpenAIRetry } from "@/lib/openai-retry";
import {
  invoiceExtractionSchema,
  fiscalAuthSupplementSchema,
  amountsSupplementSchema,
  discountSupplementSchema,
  type InvoiceExtraction,
  type AmountsSupplement,
  type DiscountSupplement,
} from "@/lib/schemas";

export type InvoiceExtractOptions = {
  /** Proveedores del maestro con CUIT; solo si hay datos, se añade al system prompt. */
  maestroCuitHintsBlock?: string | null;
  /** Plan de cuentas importado; la IA elige chart_account_code de esta lista. */
  chartAccountHintsBlock?: string | null;
};

const EXTRACTION_RULES = `- Montos e importes (CRÍTICO — máxima precisión):
  • Formato argentino impreso: miles con PUNTO, decimales con COMA (ej. "1.227,55" = 1227.55; "61,38" = 61.38). Ignorá el prefijo "USD", "$" o "ARS" y devolvé el número decimal interno (1227.55).
  • Leé el RECUADRO DE TOTALES del pie de factura (típicamente abajo a la derecha): Subtotal/Neto gravado, Total IVA, Total Percep./Percepciones, Total final.
  • net_amount = importe ANTES de IVA y percepciones (suele decir "Subtotal", "Neto gravado", "Importe neto"). Es el importe base, normalmente el MENOR del recuadro. NO uses filas rotuladas "TOTAL NETO", "Total a pagar" ni el total final como net_amount sin verificar.
  • total_amount = importe FINAL del comprobante: LEELO del recuadro de totales (no lo calcules solo sumando componentes). Equivale a Subtotal + IVA + percepciones. Algunos comprobantes rotulan mal el total final como "TOTAL NETO" o "Neto": si ese número = Subtotal + IVA + percepciones, es total_amount, NO net_amount; suele ser el MAYOR del recuadro.
  • Devolvé SIEMPRE net_amount y total_amount por separado si ambos aparecen en el recuadro, aunque tengan rótulos parecidos ("Neto", "TOTAL NETO", "Total").
  • ANTES de responder, verificá que net_amount + vat_amount + perceptions_amount ≈ total_amount (tolerancia centavos). Si NO cierra, RELEÉ: el neto gravado suele ser el MENOR importe base del recuadro (Subtotal); el total final el MAYOR que cierra la suma.
  • Si hay caja "Saldo en cuenta" o desglose lateral (abajo a la izquierda) con "Perc IIBB", usala para validar el Total Percep. IIBB del recuadro derecho; si difieren, releé ambos.
  • Dígitos similares: prestá atención a 1/7, 2/3, 4/6, 5/8, 0/8. Si un dígito es ambiguo, preferí el valor que hace cerrar la suma con el Total impreso.
  • Si hay varios totales, elegí el total final a pagar del recuadro principal de totales.
- CUIT del EMISOR (campo "cuit"): SOLO el de la CABECERA / membrete / bloque fiscal del PROVEEDOR (arriba del documento, junto al nombre del emisor). Contá exactamente 11 dígitos y devolvé XX-XXXXXXXX-X. NUNCA uses el CUIT del cliente, destinatario, alumno ni el del cuerpo bajo "Consumidor final". Si hay dos CUITs, siempre el del encabezado del emisor. Si en cabecera se leen 11 dígitos claros (aunque haya otro CUIT abajo), devolvé esos 11 dígitos formateados: NO uses null solo por dudar del dígito verificador AFIP ni por existencia de otro CUIT en el cuerpo.
- invoice_number: si el encabezado AFIP muestra "Punto de Venta" / "Punto de Vta" y "Número" / "Comp. Nro" (típicamente arriba a la derecha, junto a FACTURA A/B/C), combiná ambos en NNNNN-NNNNNNNN (5 dígitos PV + guion + 8 dígitos número, con ceros a la izquierda; ej. PV 00004 y Nro 00059991 → 00004-00059991). No confundir con CAE, OC, códigos de ítem ni número de cliente. Si solo hay un número sin punto de venta, devolvé ese valor sin inventar PV.
- Fecha: ISO YYYY-MM-DD.
- invoice_type: letra del comprobante (A, B, C, M, E) si aparece.
- document_title: título o encabezado principal impreso en grande (ej. "PARTE DIARIO", "PRESUPUESTO", "FACTURA A", "ORDEN DE COMPRA", "NOTA DE PEDIDO"). Devolvé el texto tal cual aparece; null si no hay título claro. NO confundir con nombre del proveedor ni con "O.DE COMPRA" como subtítulo.
- afip_comprobante_code: el CÓDIGO DE COMPROBANTE AFIP/ARCA impreso en el documento. En comprobantes fiscales suele ser un recuadro "Cód. NN" / "Código NN" (1 a 3 dígitos) ubicado junto a la letra grande A/B/C (típicamente en el centro o arriba del comprobante; ej. 01, 06, 011). Devolvé SOLO ese número si está realmente impreso como código de comprobante AFIP. Devolvé null si es un presupuesto, nota de pedido, parte diario, remito interno, orden de compra o cualquier documento que NO tenga ese recuadro de código AFIP. NUNCA lo confundas con el número de comprobante, CAE/CAI/CAEA, punto de venta, código de artículo, número de cliente ni teléfono. Ante la duda, null.
- fiscal_auth_type y fiscal_auth_code: autorización fiscal distinta del código de comprobante AFIP. Buscá en el PIE o esquina inferior del documento:
  • CAE: texto "CAE N°" / "CAE:" con número y "Vto. CAE" / "Fecha Vto. CAE" (facturas electrónicas).
  • CAEA: texto "CAEA" con número de autorización (comprobantes con CAEA).
  • CAI: texto "CAI:" con número y "Fecha Vencimiento" (remitos fiscales de imprenta, facturas en papel autorizadas; revisá SIEMPRE el pie y la esquina inferior derecha — suele verse como "CAI: 52076217180318 - Fecha Vencimiento: DD/MM/AAAA").
  • TICKET_FISCAL: comprobante de controlador fiscal ("C.F.", "Controlador Fiscal", "TIQUE", "Tique Factura", código de barras fiscal de ticket).
  Devolvé fiscal_auth_type según lo que encuentres y fiscal_auth_code con el número (CAE/CAEA/CAI). Para TICKET_FISCAL, fiscal_auth_code = null. Si no hay ninguna autorización fiscal legible, ambos null. NO confundir CAE/CAI con número de comprobante ni con código AFIP.
- document_kind: tipo según encabezado — "FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "REMITO" (si dice REMITO / letra R en recuadro), "PRESUPUESTO" (presupuesto, nota de pedido, parte diario, orden interna SIN CAE/CAI/CAEA ni código AFIP). Si hay CAE, CAI o CAEA, NO es PRESUPUESTO.
- chart_account_code: si se incluye el plan de cuentas del usuario, elegí el código de la cuenta (efectivo, banco, mercado pago, etc.) que corresponda al medio de pago o imputación visible en la factura; si no hay plan o no hay señal, null.
- Desglose fiscal (pie de factura / tabla de impuestos / totales): leé cada renglón por separado.
- vat_lines: cada fila de IVA con label (ej. "IVA 21%", "IVA 10,5%") y amount. Si hay un solo importe de IVA, un solo elemento. null si no hay IVA. INVARIANTE: la suma de vat_lines DEBE igualar el "Total IVA" del recuadro derecho (vat_amount). Si no cierra, releé el renglón más chico del desglose (típicamente 10,5%) dígito por dígito — error frecuente 50,73 leído como 503,73 (0,05 vs 0,5).
- vat_amount: el "Total IVA" impreso en el RECUADRO DE TOTALES (derecha), leído de forma INDEPENDIENTE (no lo deduzcas solo de vat_lines). Debe igualar la suma de vat_lines; si difieren, prevalece este "Total IVA" del recuadro y hay que releer el desglose.
- perception_lines: OBLIGATORIO siempre que haya alguna percepción con importe > 0. Un elemento por cada renglón de percepción con importe, con label (texto del renglón), amount y kind. NUNCA devuelvas perception_lines=null si perceptions_amount > 0: si hay un total de percepciones, tiene que existir al menos un renglón que lo origine — encontralo e itemizalo. kind = "IVA" para percepción de IVA (ej. "Perc. IVA", "Perc. IVA no Cat.", "Percepción IVA") y kind = "IIBB" para percepción de Ingresos Brutos (ej. "Perc. IIBB Bs.As.", "Percepción IIBB CABA"). REGLA CLAVE: clasificá el kind por el CONCEPTO del renglón, NO por el título de la sección. CASO FRECUENTE: hay una grilla titulada "PERCEPCIONES IIBB" con jurisdicciones (C.A.B.A., Bs.As., Tucumán, Misiones, Río Negro, etc.) TODAS en 0,00 y, dentro de esa misma grilla, un renglón "Perc. IVA" (o "Perc. IVA no Cat.") CON importe (ej. "Perc. IVA 3,00 % 53.385,12"). Ese renglón NO es IIBB: emitilo como perception_line con kind "IVA" aunque esté bajo el título "PERCEPCIONES IIBB". NO devuelvas solo el total ignorando esa fila. Devolvé SOLO los renglones con importe > 0 con su kind real; no incluyas los que están en 0,00. null únicamente si no hay ninguna percepción con importe.
- perceptions_amount: suma de los amount de perception_lines (que deben existir si esto es > 0), o el total de percepciones si por algún motivo no pudiste itemizar.
- discount_lines: ARRAY con UN elemento por cada bonificación GLOBAL con importe > 0 (ej. filas "BONIFICACION GENERAL", "BONIFICACION ESPECIAL", "BONIFICACION ADICIONAL" repetidas — Jeluz). CRÍTICO: si hay 7 filas Jeluz, devolvé 7 objetos. NO incluyas: columna "Bon (%)" del detalle; renglones "DESCUENTO X %" del detalle si el Subtotal del pie ya los refleja (LIPO, SAP, etc.); rótulos sin importe (ej. "BONIFICACION EN MERCADERIAS"); Subtotal ni "Saldo en cuenta". Si neto+IVA+percepciones≈total y los descuentos solo aparecen en el detalle de ítems, discount_lines null.
- discount_amount: suma de discount_lines. null si los descuentos ya están incluidos en net_amount/subtotal. NO sumes bonificaciones en el cuadre net+IVA+percepciones≈total.
- exchange_rate: tipo de cambio USD→ARS si el comprobante lo trae (típicamente en el pie: "Tipo de cambio de referencia US$ 1 = 1.415,00" o "Exclusivamente para efectos fiscales el tipo de cambio de este documento es de USD 1 = $ 1.460,00"). Devolvé SOLO los pesos por dólar (1.460,00 → 1460). Leelo aunque los importes se devuelvan sin prefijo de moneda. null si no figura.
Para el resto de campos: si un dato no está en el texto o no es legible en la imagen, devolvé null. Para "cuit", solo null si en la cabecera del emisor no hay ningún CUIT legible. confidence: qué tan seguro estás de los montos y el proveedor (0 a 1).`;

const SYSTEM_PROMPT_TEXT = `Sos un asistente contable para Argentina. A partir del texto OCR de una factura de proveedor, extraé campos estructurados.
${EXTRACTION_RULES}`;

const SYSTEM_PROMPT_VISION = `Sos un asistente contable para Argentina. A partir de la imagen de una factura de proveedor, leé el comprobante y extraé los mismos campos estructurados.
${EXTRACTION_RULES}`;

function buildSystemPrompt(base: string, options: InvoiceExtractOptions): string {
  const blocks = [
    options.maestroCuitHintsBlock?.trim(),
    options.chartAccountHintsBlock?.trim(),
  ].filter((b): b is string => Boolean(b));
  if (blocks.length === 0) return base;
  return `${base}\n\n---\n${blocks.join("\n\n---\n")}`;
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está definido.");
  }
  return new OpenAI({ apiKey });
}

function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}

const EXTRACTION_TEMPERATURE = 0;

export async function extractInvoiceData(
  rawOcrText: string,
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  const openai = getOpenAI();
  const trimmed = rawOcrText.slice(0, 48_000);
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_TEXT, options);

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `Texto OCR de la factura. Para "cuit" usá solo el CUIT del EMISOR en cabecera/membrete (11 dígitos); ignorá CUITs de cliente o receptor en el cuerpo del texto. Para "invoice_number", si hay Punto de Venta y Número en cabecera, devolvé NNNNN-NNNNNNNN (ej. 00004-00059991).\n\n${trimmed}`,
        },
      ],
      response_format: zodResponseFormat(
        invoiceExtractionSchema,
        "invoice_extraction",
      ),
    }),
  );

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}

export async function extractInvoiceDataFromImage(
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png",
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  const openai = getOpenAI();
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_VISION, options);

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraé los datos estructurados de esta factura (imagen). Para el campo cuit usá únicamente el CUIT del EMISOR en la cabecera del comprobante (bloque superior del vendedor); ignorá CUITs de cliente o receptor en el medio o abajo del documento. Para invoice_number, si en cabecera (arriba a la derecha) hay Punto de Venta y Número, combiná en NNNNN-NNNNNNNN (ej. 00004-00059991). Para importes, leé el recuadro de totales y verificá que neto+IVA+percepciones≈total. Para bonificaciones: solo filas GLOBALES BONIFICACION GENERAL/ESPECIAL/ADICIONAL (Jeluz); NO uses la columna Bon (%) del detalle de ítems ni el Subtotal como bonificación.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(
        invoiceExtractionSchema,
        "invoice_extraction",
      ),
    }),
  );

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}

const FISCAL_AUTH_VISION_PROMPT = `Sos un asistente contable para Argentina. Tu ÚNICA tarea es leer la autorización fiscal impresa en el PIE o ESQUINA INFERIOR del comprobante (últimos 15% de la página).

Buscá SOLO si el texto está explícito:
- CAI: "CAI:" seguido de un número largo (10-20 dígitos), a menudo con "Fecha Vencimiento".
- CAE: "CAE N°" / "CAE:" con número y "Vto. CAE".
- CAEA: "CAEA" con número.

NO reportes autorización en presupuestos, partes diarios, órdenes de compra ni notas de pedido internas (no tienen CAE/CAI/CAEA).
NO reportes TICKET_FISCAL ni inventes números a partir de firmas, sellos, OC ni totales.
Si no ves "CAE", "CAEA" o "CAI" con su número impreso en el pie, devolvé fiscal_auth_type y fiscal_auth_code null.`;

/**
 * Segunda pasada de visión solo para CAE/CAEA/CAI cuando la extracción principal no los detectó.
 * Necesaria en fotos/escaneos donde no hay texto OCR embebido.
 */
export async function supplementFiscalAuthFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
): Promise<{ fiscal_auth_type: InvoiceExtraction["fiscal_auth_type"]; fiscal_auth_code: string | null } | null> {
  if (images.length === 0) return null;

  const openai = getOpenAI();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Enfocate en el pie de página y la esquina inferior derecha. ¿Hay CAE, CAEA o CAI impreso con su número? Solo devolvé tipo y número si están explícitos; si no, ambos null.",
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: FISCAL_AUTH_VISION_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(
        fiscalAuthSupplementSchema,
        "fiscal_auth_supplement",
      ),
    }),
  );

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed?.fiscal_auth_type) return null;

  if (!acceptFiscalAuthSupplement(parsed)) return null;

  return {
    fiscal_auth_type: parsed.fiscal_auth_type,
    fiscal_auth_code: parsed.fiscal_auth_code,
  };
}

export async function extractInvoiceDataFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  if (images.length === 0) {
    throw new Error("Se requiere al menos una imagen para la extracción.");
  }
  if (images.length === 1) {
    return extractInvoiceDataFromImage(
      images[0]!.buffer,
      images[0]!.mimeType,
      options,
    );
  }

  const openai = getOpenAI();
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_VISION, options);
  const partLabels = images.map((_, i) => `parte ${i + 1}`).join(", ");

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Estas ${images.length} imágenes (${partLabels}) son partes de un mismo comprobante de factura. Combiná la información de todas las páginas en una única extracción estructurada. Para el campo cuit usá únicamente el CUIT del EMISOR en la cabecera del comprobante. Para invoice_number, si en cabecera hay Punto de Venta y Número, combiná en NNNNN-NNNNNNNN. Para importes, leé el recuadro de totales y verificá que neto+IVA+percepciones≈total. Para bonificaciones: solo filas GLOBALES BONIFICACION GENERAL/ESPECIAL/ADICIONAL; NO uses la columna Bon (%) del detalle de ítems ni el Subtotal como bonificación.`,
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(
        invoiceExtractionSchema,
        "invoice_extraction",
      ),
    }),
  );

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}

const AMOUNTS_SUPPLEMENT_VISION_PROMPT = `Sos un asistente contable para Argentina. La imagen es un RECORTE AMPLIADO de la franja inferior del comprobante (recuadro de totales a la derecha y, si aparece, caja "Saldo en cuenta" / desglose a la izquierda).

Buscá y devolvé SOLO estos importes:
- net_amount: "Subtotal", "Neto gravado", "Importe neto" — importe SIN IVA ni percepciones (suele ser la fila base más chica del recuadro). NO confundas con "TOTAL NETO" ni "Neto" del pie si ese valor = Subtotal + IVA + percepciones (en ese caso es total_amount, no net_amount).
- vat_amount: el "Total IVA" impreso en el recuadro derecho, leído INDEPENDIENTE y dígito por dígito. La suma de vat_lines (21% + 10,5%) DEBE igualarlo; si no cierra, releé el renglón más chico (típico 10,5%) — error frecuente 50,73 vs 503,73 (0,05 vs 0,5).
- perceptions_amount: total de percepciones del recuadro. OJO: el bloque suele titularse "PERCEPCIONES IIBB" con jurisdicciones (C.A.B.A., Bs.As., Tucumán, Misiones, Río Negro) en 0,00 y, dentro, un renglón "Perc. IVA" / "Perc. IVA no Cat." CON importe (ej. "Perc. IVA 3,00 % 53.385,12"). Ese importe es percepción de IVA, no de IIBB, aunque esté bajo ese título.
- perceptions_amount_secondary: "Perc IIBB" / percepción IIBB en la caja "Saldo en cuenta" o desglose INFERIOR IZQUIERDO (si está visible). Debe coincidir con perceptions_amount; si leés valores distintos, devolvé ambos.
- total_amount: total FINAL a pagar (Subtotal + IVA + percepciones). Puede figurar como "Total", "TOTAL NETO" o "Neto" en el pie — verificá que sea la suma, no el Subtotal.
- exchange_rate: tipo de cambio USD→ARS de la letra chica legal del pie ("Tipo de cambio de referencia US$ 1 = 1.415,00" o "Exclusivamente para efectos fiscales el tipo de cambio de este documento es de USD 1 = $ 1.460,00"). Este recorte es de ALTA RESOLUCIÓN: leelo dígito por dígito con cuidado (6 vs 1 vs 0; ej. 1.460 no 1.410). Devolvé SOLO los pesos por dólar (1.460,00 → 1460). null si no aparece en este recorte.
- Devolvé SIEMPRE net_amount y total_amount por separado si ambos están visibles, aunque el rótulo del total diga "TOTAL NETO" o "Neto".

Reglas CRÍTICAS:
- Formato argentino: miles con punto, decimales con coma (1.227,55 → 1227.55). Ignorá "USD" o "$".
- Leé dígito por dígito. Cuidado con 4/6 (61,38 vs 59,38 o 41,38) y en el Total (1.546,72 vs 1.544,72).
- CRUZÁ perceptions_amount (derecha) con perceptions_amount_secondary (izquierda): si difieren, releé ambos antes de responder.
- ANTES de responder, verificá net_amount + vat_amount + perceptions_amount ≈ total_amount. Si no cierra, releé cada dígito del Total y de Percepciones.
- perception_lines: OBLIGATORIO si perceptions_amount > 0. Itemizá cada renglón de percepción con importe (incluido el "Perc. IVA" dentro del bloque "PERCEPCIONES IIBB") con su label, amount y kind: "IVA" para percepción de IVA, "IIBB" para Ingresos Brutos, según el CONCEPTO del renglón. NUNCA dejes perception_lines=null cuando hay un total de percepciones. vat_lines: solo si hay desglose visible, y su suma DEBE igualar vat_amount (Total IVA); si no, releé el renglón más chico.
- Si un importe no es legible, null (no inventes).`;

/**
 * Segunda pasada de visión enfocada en el recuadro de totales cuando la suma no cierra.
 */
export async function supplementAmountsFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
): Promise<AmountsSupplement | null> {
  if (images.length === 0) return null;

  const openai = getOpenAI();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Esta imagen es un recorte ampliado del pie de la factura. Leé Subtotal (neto gravado), IVA, Percepciones y total FINAL. Si una fila dice TOTAL NETO o Neto pero su valor = Subtotal + IVA + percepciones, es el total final, no el subtotal. Cruzá percepciones izquierda/derecha. Releé dígitos (6 vs 4).",
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: AMOUNTS_SUPPLEMENT_VISION_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(
        amountsSupplementSchema,
        "amounts_supplement",
      ),
    }),
  );

  return completion.choices[0]?.message?.parsed ?? null;
}

const DISCOUNT_SUPPLEMENT_VISION_PROMPT = `Sos un asistente contable para Argentina. Tu ÚNICA tarea es leer las filas de bonificaciones/descuentos GLOBALES y devolver el PORCENTAJE de cada una.

Las filas válidas suelen decir "BONIFICACION GENERAL", "BONIFICACION ESPECIAL", "BONIFICACION ADICIONAL" (puede repetirse) con un porcentaje (ej. 20,00 %, 16,00 %).

IGNORÁ por completo:
- La columna "Bon (%)" / "Bon" / "Bonificación" del DETALLE DE ÍTEMS (descuento por línea, ya incluido en SubTotal s/IVA).
- Filas repetidas del mismo % en cada ítem (ej. Bon 50,00% en 6 artículos) — eso NO es bonificación global.
- El Subtotal, "Saldo en cuenta" ni totales del pie.

La imagen es un recorte AMPLIADO del bloque de bonificaciones (escala de grises).

Reglas CRÍTICAS:
- discount_lines: UN objeto por cada fila GLOBAL visible. Si hay 7 filas Jeluz, devolvé 7 objetos.
- percentage: SOLO el número del porcentaje (20 para 20,00 %; 10,5 para 10,50 %). NO devuelvas importes en pesos.
- Leé el porcentaje con cuidado (20 vs 19, 16 vs 15, 10 vs 19).
- NO incluyas filas sin porcentaje legible. Si solo hay Bon (%) por ítem o no hay bonificaciones globales, discount_lines null.`;

/**
 * Segunda pasada de visión enfocada en la columna de bonificaciones cuando la extracción principal no las lista todas.
 */
export async function supplementDiscountFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
): Promise<DiscountSupplement | null> {
  if (images.length === 0) return null;

  const openai = getOpenAI();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Leé SOLO filas BONIFICACION GENERAL/ESPECIAL/ADICIONAL (bonificación global). Ignorá la columna Bon (%) del detalle de ítems. Devolvé label y percentage de cada fila global (NO importes). Si no hay bonificaciones globales, discount_lines null.",
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await withOpenAIRetry(() =>
    openai.beta.chat.completions.parse({
      model: getOpenAIModel(),
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: "system", content: DISCOUNT_SUPPLEMENT_VISION_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(
        discountSupplementSchema,
        "discount_supplement",
      ),
    }),
  );

  return completion.choices[0]?.message?.parsed ?? null;
}
