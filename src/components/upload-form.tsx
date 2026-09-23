"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { useFormStatus } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Trash2,
  Upload,
} from "lucide-react";

import {
  uploadInvoiceBatch,
  type UploadBatchState,
} from "@/actions/invoices";
import { UploadBatchResultsView } from "@/components/upload-batch-results-view";
import { compressInvoiceImage } from "@/lib/client-image-compress";
import {
  UPLOAD_REQUEST_MAX_BYTES,
  packUploadChunks,
} from "@/lib/upload-chunking";
import type { SerializedBatchInvoice } from "@/types/invoice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BATCH_MAX = Number(process.env.NEXT_PUBLIC_BATCH_MAX_FILES ?? "10") || 10;
/** Fotos: se comprimen en el navegador antes de subir, así que aceptamos originales grandes. */
const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_MB = UPLOAD_REQUEST_MAX_BYTES / (1024 * 1024);

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function dropzoneErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case "file-too-large":
      return "Supera el tamaño máximo.";
    case "file-invalid-type":
      return "Solo PDF, JPG o PNG.";
    case "too-many-files":
      return `Máximo ${BATCH_MAX} archivos por lote.`;
    default:
      return fallback;
  }
}

/**
 * Comprime fotos y reparte el lote en varios requests: Vercel corta cada request en 4,5 MB
 * y cada invocación tiene un tiempo máximo, así que no se puede mandar todo junto.
 */
async function submitBatchInChunks(
  _prev: UploadBatchState,
  formData: FormData,
): Promise<UploadBatchState> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { status: "error", message: "No se recibió ningún archivo." };
  }
  const groups = JSON.parse(String(formData.get("groups") ?? "[]")) as number[][];
  const prepared = await Promise.all(files.map((f) => compressInvoiceImage(f)));

  const { chunks, oversized } = packUploadChunks(
    groups,
    prepared.map((f) => f.size),
  );
  if (oversized.length > 0) {
    const names = oversized
      .map((g) => g.map((idx) => files[idx]!.name).join(" + "))
      .join(", ");
    return {
      status: "error",
      message: `Cada factura puede pesar hasta ${MAX_REQUEST_MB} MB en total y estas la superan: ${names}. Comprimí el PDF (o separalo en partes) y volvé a intentar.`,
    };
  }

  const batchId = crypto.randomUUID();
  const invoiceIds: string[] = [];
  const invoices: SerializedBatchInvoice[] = [];
  let last: Extract<UploadBatchState, { status: "ok" }> | null = null;

  for (const chunk of chunks) {
    const fd = new FormData();
    let next = 0;
    const localGroups = chunk.groups.map((group) =>
      group.map((idx) => {
        fd.append("files", prepared[idx]!);
        return next++;
      }),
    );
    fd.set("groups", JSON.stringify(localGroups));
    fd.set("batchId", batchId);

    let res: UploadBatchState;
    try {
      res = await uploadInvoiceBatch({ status: "idle" }, fd);
    } catch {
      res = {
        status: "error",
        message: "No se pudo completar la subida (error de red o del servidor).",
      };
    }
    if (res.status !== "ok") {
      const message = res.status === "error" ? res.message : "Error inesperado.";
      return {
        status: "error",
        message:
          invoiceIds.length > 0
            ? `${message} Las ${invoiceIds.length} factura(s) anteriores de este lote ya se procesaron: las encontrás en Historial.`
            : message,
      };
    }
    invoiceIds.push(...res.invoiceIds);
    invoices.push(...res.invoices);
    last = res;
  }

  return last
    ? { ...last, batchId, invoiceIds, invoices }
    : { status: "error", message: "No se recibió ningún archivo." };
}

type QueueItem = {
  id: string;
  file: File;
  preview: string | null;
  isContinuation: boolean;
};

function buildGroups(items: QueueItem[]): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    if (i === 0 || !items[i]!.isContinuation) {
      groups.push([i]);
    } else {
      groups[groups.length - 1]!.push(i);
    }
  }
  return groups;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function SubmitButton({ invoiceCount, fileCount }: { invoiceCount: number; fileCount: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || fileCount === 0}
      className="w-full sm:w-auto"
    >
      {pending
        ? `Procesando ${invoiceCount} factura${invoiceCount !== 1 ? "s" : ""} (${fileCount} archivo${fileCount !== 1 ? "s" : ""})…`
        : `Procesar ${invoiceCount} factura${invoiceCount !== 1 ? "s" : ""}`}
    </Button>
  );
}

function PendingHint({ invoiceCount, fileCount }: { invoiceCount: number; fileCount: number }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Subiendo {fileCount} archivo{fileCount !== 1 ? "s" : ""} en {invoiceCount}{" "}
      factura{invoiceCount !== 1 ? "s" : ""} → extracción con IA. Los lotes grandes
      se envían en partes; puede tardar unos minutos.
    </p>
  );
}

const initialState: UploadBatchState = { status: "idle" };

export function UploadForm({
  presupuestoLetra = null,
  presupuestoEmpresa = null,
}: {
  presupuestoLetra?: string | null;
  presupuestoEmpresa?: string | null;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [state, formAction, isPending] = useActionState(
    submitBatchInChunks,
    initialState,
  );
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [batchInvoices, setBatchInvoices] = useState<
    SerializedBatchInvoice[] | null
  >(null);

  const groups = useMemo(() => buildGroups(items), [items]);
  const invoiceCount = groups.length;

  const onDrop = useCallback((accepted: File[]) => {
    setItems((prev) => {
      const room = BATCH_MAX - prev.length;
      const toAdd = accepted.slice(0, Math.max(0, room));
      const next = [...prev];
      for (const file of toAdd) {
        next.push({
          id: crypto.randomUUID(),
          file,
          preview:
            file.type.startsWith("image/") ||
            /\.(jpe?g|png)$/i.test(file.name)
              ? URL.createObjectURL(file)
              : null,
          isContinuation: false,
        });
      }
      return next;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg", ".jpe"],
      "image/png": [".png"],
    },
    validator: (file) => {
      const name = file.name.toLowerCase();
      const byExt = /\.(pdf|jpe?g|png)$/i.test(name);
      const t = (file.type || "").toLowerCase();
      const okType =
        !t ||
        t === "application/pdf" ||
        t === "image/jpeg" ||
        t === "image/jpg" ||
        t === "image/pjpeg" ||
        t === "image/png" ||
        t === "application/octet-stream";
      if (!byExt || !okType) {
        return { code: "file-invalid-type", message: "Solo PDF, JPG o PNG." };
      }
      // Los PDF no se comprimen en el navegador: tienen que entrar solos en un request.
      if (isPdfFile(file) && file.size > UPLOAD_REQUEST_MAX_BYTES) {
        return {
          code: "pdf-too-large",
          message: `El PDF supera ${MAX_REQUEST_MB} MB. Comprimilo o separalo en partes.`,
        };
      }
      return null;
    },
    maxFiles: BATCH_MAX,
    maxSize: IMAGE_MAX_BYTES,
    multiple: true,
    disabled: items.length >= BATCH_MAX || isPending,
  });

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    };
  }, [items]);

  useEffect(() => {
    if (state.status === "ok" && !showNewBatch) {
      setBatchInvoices(state.invoices);
    } else {
      setBatchInvoices(null);
    }
  }, [state, showNewBatch]);

  const handleInvoiceUpdated = useCallback(
    (updated: SerializedBatchInvoice) => {
      setBatchInvoices((prev) => {
        const base =
          prev ?? (state.status === "ok" ? state.invoices : null);
        if (!base) return null;
        return base.map((inv) => (inv.id === updated.id ? updated : inv));
      });
    },
    [state],
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  };

  const toggleContinuation = (id: string, checked: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isContinuation: checked } : item,
      ),
    );
  };

  const getPartLabel = (index: number): string | null => {
    if (index === 0 || !items[index]?.isContinuation) return null;
    let part = 2;
    for (let i = index - 1; i >= 0; i--) {
      if (i === 0 || !items[i]?.isContinuation) break;
      part++;
    }
    return `Parte ${part}`;
  };

  const getInvoiceNumber = (index: number): number => {
    let n = 1;
    for (let i = 0; i <= index; i++) {
      if (i === 0 || !items[i]?.isContinuation) {
        if (i === index) return n;
        n++;
      }
    }
    return n;
  };

  const handleSubmit = (formData: FormData) => {
    setShowNewBatch(false);
    formData.delete("files");
    for (const item of items) {
      formData.append("files", item.file);
    }
    formData.set("groups", JSON.stringify(buildGroups(items)));
    formAction(formData);
  };

  const batchDone = state.status === "ok" && !showNewBatch;

  return (
    <div className="space-y-8">
      <Card className={cn("mx-auto w-full max-w-xl", batchDone && "max-w-5xl")}>
        <CardHeader>
          <CardTitle>Subir factura{items.length > 1 ? "s" : ""}</CardTitle>
          <CardDescription>
            {`PDF o imagen JPG / PNG. Hasta ${BATCH_MAX} archivos; PDF de hasta ${MAX_REQUEST_MB} MB (las fotos se optimizan solas). Marcá "Es continuación del archivo anterior" cuando dos fotos o PDFs son la misma factura.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {state.status === "error" ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.message}
            </div>
          ) : null}

          {batchDone ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  setItems((prev) => {
                    for (const item of prev) {
                      if (item.preview) URL.revokeObjectURL(item.preview);
                    }
                    return [];
                  });
                  setShowNewBatch(true);
                }}
              >
                Subir otro lote
              </Button>
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors",
                  isDragActive && "border-primary bg-muted/60",
                  (items.length >= BATCH_MAX || isPending) &&
                    "pointer-events-none opacity-60",
                )}
              >
                <input {...getInputProps()} />
                <Upload className="mb-2 size-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arrastrá y soltá, o hacé clic para elegir
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, JPG o PNG — {items.length}/{BATCH_MAX} archivos
                </p>
              </div>

              {fileRejections.length > 0 ? (
                <ul
                  className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  aria-live="polite"
                >
                  {fileRejections.map(({ file, errors }) => (
                    <li key={`${file.name}-${file.size}`}>
                      <span className="font-medium">{file.name}</span>
                      {" — "}
                      {errors
                        .map((e) => dropzoneErrorMessage(e.code, e.message))
                        .join(" ")}
                    </li>
                  ))}
                </ul>
              ) : null}

              {items.length > 0 ? (
                <ul className="space-y-3">
                  {items.map((item, index) => {
                    const isPdf =
                      item.file.type === "application/pdf" ||
                      item.file.name.toLowerCase().endsWith(".pdf");
                    const partLabel = getPartLabel(index);
                    const invoiceNum = getInvoiceNumber(index);

                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "flex gap-3 rounded-lg border border-border p-3",
                          item.isContinuation && "border-primary/30 bg-muted/20",
                        )}
                      >
                        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                          {item.preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.preview}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : isPdf ? (
                            <FileText className="size-8 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="size-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {item.file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatBytes(item.file.size)}
                            </span>
                            {!item.isContinuation ? (
                              <Badge variant="secondary">
                                Factura {invoiceNum}
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                {partLabel ?? "Continuación"}
                              </Badge>
                            )}
                          </div>
                          {index > 0 ? (
                            <label className="flex cursor-pointer items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-border"
                                checked={item.isContinuation}
                                onChange={(e) =>
                                  toggleContinuation(item.id, e.target.checked)
                                }
                                disabled={isPending}
                              />
                              Es continuación del archivo anterior
                            </label>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={index === 0 || isPending}
                            onClick={() => moveItem(index, -1)}
                            aria-label="Subir"
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={index === items.length - 1 || isPending}
                            onClick={() => moveItem(index, 1)}
                            aria-label="Bajar"
                          >
                            <ChevronDown />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={isPending}
                            onClick={() => removeItem(item.id)}
                            aria-label="Quitar"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
                  <ImageIcon className="size-5" />
                  Sin archivos seleccionados
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SubmitButton
                  invoiceCount={invoiceCount}
                  fileCount={items.length}
                />
                <PendingHint
                  invoiceCount={invoiceCount}
                  fileCount={items.length}
                />
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {batchDone && state.status === "ok" ? (
        <UploadBatchResultsView
          invoices={batchInvoices ?? state.invoices}
          taxChartAccounts={state.taxChartAccounts}
          apiConfigured={state.apiConfigured}
          presupuestoLetra={presupuestoLetra}
          presupuestoEmpresa={presupuestoEmpresa}
          onInvoiceUpdated={handleInvoiceUpdated}
        />
      ) : null}
    </div>
  );
}
