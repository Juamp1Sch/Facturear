import { supplementFiscalAuthFromImages } from "@/lib/ai";
import { enrichFiscalAuthFromText } from "@/lib/fiscal-auth-detect";
import type { InvoiceExtraction } from "@/lib/schemas";

type VisionImage = { buffer: Buffer; mimeType: "image/jpeg" | "image/png" };

/**
 * Completa fiscal_auth_type/code cuando la extracción principal no los detectó:
 * 1) regex sobre texto OCR embebido
 * 2) segunda pasada de visión enfocada en el pie (CAI/CAE en fotos y PDFs escaneados)
 */
export async function enrichExtractionFiscalAuth(
  extracted: InvoiceExtraction,
  opts: {
    rawOcrText?: string | null;
    visionImages?: VisionImage[];
  },
): Promise<InvoiceExtraction> {
  let result = enrichFiscalAuthFromText(extracted, opts.rawOcrText);

  if (!result.fiscal_auth_type && opts.visionImages?.length) {
    const supplement = await supplementFiscalAuthFromImages(opts.visionImages);
    if (supplement) {
      result = {
        ...result,
        fiscal_auth_type: supplement.fiscal_auth_type,
        fiscal_auth_code:
          supplement.fiscal_auth_code ?? result.fiscal_auth_code,
        document_kind:
          supplement.fiscal_auth_type === "CAI" &&
          (result.document_kind === "PRESUPUESTO" || !result.document_kind)
            ? "REMITO"
            : result.document_kind,
      };
    }
  }

  return result;
}
