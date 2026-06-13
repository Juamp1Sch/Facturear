"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import {
  resolveFechaFacturaForApi,
  todayCalendarDateArgentina,
} from "@/lib/invoice-calendar-date";
import { buildInvoiceJson } from "@/lib/invoice-json";
import { parseDiscountFromPayload, parseTaxBreakdownFromPayload } from "@/lib/tax-breakdown";
import { resolveTaxChartAccountsForUser } from "@/lib/tax-chart-account";
import { buildIntegrationAuthHeaders } from "@/lib/integration-auth";

const UPLOAD_TIMEOUT_MS = 30_000;
const MAX_BODY_STORE = 4000;

export type UploadInvoiceToDestinationResult =
  | { ok: true; status: number; bodyPreview: string }
  | { ok: false; error: string; status?: number; bodyPreview?: string };

export async function uploadInvoiceToDestination(
  invoiceId: string,
): Promise<UploadInvoiceToDestinationResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Falta DATABASE_URL. Configurá la base de datos primero." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const userId = session.user.id;

  const [invoice, config] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { chartAccount: true },
    }),
    prisma.integrationConfig.findUnique({
      where: { userId },
    }),
  ]);

  if (!invoice) {
    return { ok: false, error: "Factura no encontrada." };
  }

  if (!config?.apiUrl?.trim() || !config?.userToken?.trim()) {
    return {
      ok: false,
      error: "Falta configurar la API. Andá a API en el menú y guardá la URL y el token.",
    };
  }

  if (invoice.status === "PROCESSING") {
    return { ok: false, error: "La factura aún se está procesando." };
  }

  if (invoice.status === "ERROR") {
    return { ok: false, error: "La factura tiene error de procesamiento; corregila antes de cargar." };
  }

  const taxChartAccounts = await resolveTaxChartAccountsForUser(userId);
  const taxBreakdown = parseTaxBreakdownFromPayload(invoice.aiPayload);
  const discountBreakdown = parseDiscountFromPayload(
    invoice.aiPayload,
    invoice.rawOcrText,
  );

  const payload = buildInvoiceJson({
    movementId: invoice.movementId,
    empresa: invoice.empresa,
    sucursal: invoice.sucursal,
    supplierCode: invoice.supplierCode,
    invoiceDate: invoice.invoiceDate,
    invoiceType: invoice.invoiceType,
    documentKind: invoice.documentKind,
    invoiceNumber: invoice.invoiceNumber,
    netAmount: invoice.netAmount?.toString() ?? null,
    vatAmount: invoice.vatAmount?.toString() ?? null,
    vatLines: taxBreakdown.vatLines,
    perceptionsAmount: invoice.perceptionsAmount?.toString() ?? null,
    perceptionLines: taxBreakdown.perceptionLines,
    discountAmount:
      discountBreakdown.discountAmount != null
        ? String(discountBreakdown.discountAmount)
        : null,
    discountLines: discountBreakdown.discountLines,
    totalAmount: invoice.totalAmount?.toString() ?? null,
    chartAccount: invoice.chartAccount
      ? {
          id: invoice.chartAccount.id,
          code: invoice.chartAccount.code,
          name: invoice.chartAccount.name,
          type: invoice.chartAccount.type,
        }
      : null,
    vatChartAccountCode: taxChartAccounts.vatAccountCode,
    perceptionIvaAccountCode: taxChartAccounts.perceptionIvaAccountCode,
    perceptionIibbAccountCode: taxChartAccounts.perceptionIibbAccountCode,
    bonificacionAccountCode: taxChartAccounts.bonificacionAccountCode,
    ignoreBonificaciones: taxChartAccounts.ignoreBonificaciones,
    tipoMoneda: invoice.tipoMoneda,
  });

  if (!payload.fechaFactura) {
    return {
      ok: false,
      error:
        "Falta la fecha de la factura (formato yyyy-mm-dd). Completala en Editar antes de cargar.",
    };
  }

  const todayAr = todayCalendarDateArgentina();
  if (payload.fechaFactura > todayAr) {
    return {
      ok: false,
      error: `La fecha de factura (${payload.fechaFactura}) es posterior a hoy (${todayAr}). Revisá el año en Editar; SIG suele rechazar fechas futuras.`,
    };
  }

  let res: Response;
  try {
    res = await fetch(config.apiUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...buildIntegrationAuthHeaders(config.userToken),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, error: `No se pudo conectar con la API: ${msg}` };
  }

  const bodyText = await res.text();
  const bodyPreview =
    bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText;

  const storedBody = bodyText.slice(0, MAX_BODY_STORE);

  if (res.ok) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        destinationUploadedAt: new Date(),
        destinationUploadStatus: res.status,
        destinationUploadBody: storedBody || null,
      },
    });

    revalidatePath("/history");
    revalidatePath(`/history/${invoice.id}`);

    return { ok: true, status: res.status, bodyPreview };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      destinationUploadStatus: res.status,
      destinationUploadBody: storedBody || null,
    },
  });

  revalidatePath(`/history/${invoice.id}`);

  return {
    ok: false,
    error: `La API respondió con error (${res.status}).`,
    status: res.status,
    bodyPreview,
  };
}
