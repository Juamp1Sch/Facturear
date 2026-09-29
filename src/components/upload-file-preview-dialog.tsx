"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { Button } from "@/components/ui/button";

export type UploadFilePreview = {
  /** Object URL del archivo local (lo crea y lo revoca quien abre el modal). */
  url: string;
  mimeType: string;
  fileName: string;
  /** "Factura 2", "Parte 2"… */
  label: string;
};

/** Vista previa en modal de un archivo que todavía no se subió (desde la lista de carga). */
export function UploadFilePreviewDialog({
  preview,
  onClose,
}: {
  preview: UploadFilePreview | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preview && !dialog.open) dialog.showModal();
    if (!preview && dialog.open) dialog.close();
  }, [preview]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={preview ? `Vista previa de ${preview.fileName}` : "Vista previa"}
      className="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-xl border border-border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/50"
      onClose={onClose}
      // Clic fuera del contenido (sobre el fondo) cierra.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {preview ? (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{preview.fileName}</p>
              <p className="text-xs text-muted-foreground">{preview.label}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar vista previa"
            >
              <X />
            </Button>
          </div>
          <InvoiceDocumentPreview
            key={preview.url}
            parts={[{ mimeType: preview.mimeType, previewUrl: preview.url }]}
          />
        </>
      ) : null}
    </dialog>
  );
}
