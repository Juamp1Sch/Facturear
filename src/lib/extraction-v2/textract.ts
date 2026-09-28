import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
import sharp from "sharp";

/**
 * OCR de AWS Textract (DetectDocumentText) para fotos y PDF escaneados.
 *
 * Medido contra el set de referencia: Textract lee bien los dígitos chicos (CAE, número, fecha)
 * que GPT-6 Luna a veces corre en fotos; pasado como pista, Luna los lee bien, y como segunda
 * lectura independiente permite marcar "Revisar" cuando no coinciden.
 *
 * Credenciales: `TEXTRACT_ACCESS_KEY_ID` / `TEXTRACT_SECRET_ACCESS_KEY` si están; si no, las
 * `AWS_*` de S3 (el usuario IAM necesita `textract:DetectDocumentText`). Región:
 * `TEXTRACT_REGION` (por defecto us-east-1: Textract no está en todas las regiones).
 * `EXTRACTION_OCR=off` lo desactiva. Nunca tira: si falla, el pipeline sigue sin OCR.
 */

const TIMEOUT_MS = 20_000;
/** Límites de la API sincrónica: 10 MB y 10.000 px por lado. */
const MAX_BYTES = 9_500_000;
const MAX_SIDE_PX = 8000;

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function textractConfig() {
  if (env("EXTRACTION_OCR")?.toLowerCase() === "off") return null;
  const accessKeyId = env("TEXTRACT_ACCESS_KEY_ID") ?? env("AWS_ACCESS_KEY_ID");
  const secretAccessKey = env("TEXTRACT_SECRET_ACCESS_KEY") ?? env("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return null;
  return { region: env("TEXTRACT_REGION") ?? "us-east-1", credentials: { accessKeyId, secretAccessKey } };
}

let client: TextractClient | null = null;
function getClient(config: NonNullable<ReturnType<typeof textractConfig>>): TextractClient {
  client ??= new TextractClient(config);
  return client;
}

async function toTextractJpeg(buffer: Buffer): Promise<Buffer> {
  const oriented = sharp(buffer).rotate().resize({
    width: MAX_SIDE_PX,
    height: MAX_SIDE_PX,
    fit: "inside",
    withoutEnlargement: true,
  });
  let quality = 92;
  let jpeg = await oriented.clone().jpeg({ quality }).toBuffer();
  while (jpeg.length > MAX_BYTES && quality > 50) {
    quality -= 10;
    jpeg = await oriented.clone().jpeg({ quality }).toBuffer();
  }
  return jpeg;
}

/**
 * Texto (una línea por renglón) de cada página, en el mismo orden; `null` si Textract no está
 * configurado o falla alguna página.
 */
export async function detectDocumentText(pages: Buffer[]): Promise<string[] | null> {
  const config = textractConfig();
  if (!config || pages.length === 0) return null;
  try {
    const textract = getClient(config);
    return await Promise.all(
      pages.map(async (page) => {
        const result = await textract.send(
          new DetectDocumentTextCommand({ Document: { Bytes: await toTextractJpeg(page) } }),
          { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
        );
        return (result.Blocks ?? [])
          .filter((b) => b.BlockType === "LINE" && b.Text)
          .map((b) => b.Text)
          .join("\n");
      }),
    );
  } catch (e) {
    console.warn(`[extraction-v2] Textract no disponible, sigo sin OCR: ${e instanceof Error ? e.name : String(e)}`);
    return null;
  }
}
