"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useFormStatus } from "react-dom";
import { FileText, ImageIcon, Upload } from "lucide-react";

import { uploadInvoice } from "@/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Procesando…" : "Procesar factura"}
    </Button>
  );
}

function PendingHint() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Subiendo archivo → lectura de PDF o visión en imagen → extracción con IA…
      Esto puede
      tardar unos segundos.
    </p>
  );
}

export function UploadForm() {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFileName(f.name);
    setMimeType(f.type);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
      if (byExt && okType) return null;
      return { code: "file-invalid-type", message: "Solo PDF, JPG o PNG." };
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Subir factura</CardTitle>
        <CardDescription>
          PDF o imagen JPG / PNG (foto / escaneo). Si el JPEG no sube, revisá que la extensión sea .jpg o .jpeg. Máximo 10 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={uploadInvoice} className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors",
              isDragActive && "border-primary bg-muted/60",
            )}
          >
            <input {...getInputProps({ name: "file", required: true })} />
            <Upload className="mb-2 size-10 text-muted-foreground" />
            <p className="text-sm font-medium">
              Arrastrá y soltá, o hacé clic para elegir
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, JPG o PNG
            </p>
          </div>

          {fileName ? (
            <p className="text-sm text-muted-foreground">
              Archivo: <span className="font-medium text-foreground">{fileName}</span>
            </p>
          ) : null}

          {preview ? (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {mimeType === "application/pdf" ||
              fileName?.toLowerCase().endsWith(".pdf") ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <FileText className="size-8 shrink-0" />
                  Vista previa del PDF en el navegador después de procesar.
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Vista previa"
                  className="max-h-64 w-full object-contain"
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
              <ImageIcon className="size-5" />
              Sin archivo seleccionado
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SubmitButton />
            <PendingHint />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
