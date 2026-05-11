// pdf-parse is CommonJS; keep dynamic require for Next server bundles.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);
  return (text ?? "").trim();
}
