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
/** Páginas en paralelo por documento (la API sincrónica tiene un límite bajo de TPS). */
const PAGE_CONCURRENCY = 2;
/** Errores que no se arreglan reintentando (permiso o credenciales): se deja de llamar. */
const FATAL_ERRORS = new Set([
  "AccessDeniedException",
  "UnrecognizedClientException",
  "InvalidSignatureException",
  "SubscriptionRequiredException",
]);
/** Por instancia del servidor: después de un error de permiso no se vuelve a llamar. */
let disabledBy: string | null = null;
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
 * Texto (una línea por renglón) de cada página, en el mismo orden (vacío si esa página falló);
 * `null` si Textract no está configurado o no se pudo leer ninguna página.
 */
export async function detectDocumentText(pages: Buffer[]): Promise<string[] | null> {
  const config = textractConfig();
  if (!config || pages.length === 0 || disabledBy) return null;
  const textract = getClient(config);
  const readPage = async (page: Buffer) => {
    const result = await textract.send(
      new DetectDocumentTextCommand({ Document: { Bytes: await toTextractJpeg(page) } }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    return (result.Blocks ?? [])
      .filter((b) => b.BlockType === "LINE" && b.Text)
      .map((b) => b.Text)
      .join("\n");
  };
  const texts: string[] = new Array(pages.length).fill("");
  const errors: string[] = [];
  for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
    const settled = await Promise.allSettled(pages.slice(i, i + PAGE_CONCURRENCY).map(readPage));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") texts[i + j] = r.value;
      else errors.push(r.reason instanceof Error ? r.reason.name : String(r.reason));
    });
    const fatal = errors.find((name) => FATAL_ERRORS.has(name));
    if (fatal) {
      disabledBy = fatal;
      console.warn(`[extraction-v2] Textract desactivado en esta instancia (${fatal}): revisá el permiso textract:DetectDocumentText.`);
      return null;
    }
  }
  if (errors.length) console.warn(`[extraction-v2] Textract falló en ${errors.length} página(s): ${[...new Set(errors)].join(", ")}`);
  return texts.some((t) => t.trim()) ? texts : null;
}
