import { supplementFiscalAuthFromImages } from "@/lib/ai";
import {
  acceptFiscalAuthSupplement,
  shouldRunFiscalAuthSupplement,
} from "@/lib/document-class";
import { enrichFiscalAuthFromText } from "@/lib/fiscal-auth-detect";
import type { InvoiceExtraction } from "@/lib/schemas";

type VisionImage = { buffer: Buffer; mimeType: "image/jpeg" | "image/png" };

/**
 * Completa fiscal_auth_type/code cuando la extracción principal no los detectó:
 * 1) regex sobre texto OCR embebido
 * 2) segunda pasada de visión enfocada en el pie (solo con evidencia de comprobante fiscal)
 */
export async function enrichExtractionFiscalAuth(
  extracted: InvoiceExtraction,
  opts: {
    rawOcrText?: string | null;
    visionImages?: VisionImage[];
  },
): Promise<InvoiceExtraction> {
  let result = enrichFiscalAuthFromText(extracted, opts.rawOcrText);

  if (
    !result.fiscal_auth_type &&
    opts.visionImages?.length &&
    shouldRunFiscalAuthSupplement(result)
  ) {
    const supplement = await supplementFiscalAuthFromImages(opts.visionImages);
    if (acceptFiscalAuthSupplement(supplement)) {
      result = {
        ...result,
        fiscal_auth_type: supplement.fiscal_auth_type,
        fiscal_auth_code:
          supplement.fiscal_auth_code ?? result.fiscal_auth_code,
      };
    }
  }

  return result;
}
