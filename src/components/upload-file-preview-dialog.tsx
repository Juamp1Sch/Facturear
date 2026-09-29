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
  /** "Factura 2", "Factura 1 · Parte 2"… */
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
  /** El clic cierra solo si empezó Y terminó sobre el fondo (no al soltar un arrastre afuera). */
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preview && !dialog.open) dialog.showModal();
    if (!preview && dialog.open) dialog.close();
  }, [preview]);

  // `showModal()` no bloquea el scroll de la página de atrás. Se compensa el ancho de la barra
  // de scroll para que el fondo no se corra al ocultarla.
  const isOpen = preview != null;
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      root.style.overflow = previous.overflow;
      root.style.paddingRight = previous.paddingRight;
    };
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={preview ? `Vista previa de ${preview.fileName}` : "Vista previa"}
      // Sin padding: todo lo que se ve de la tarjeta es contenido, y el <dialog> en sí solo
      // recibe clics del fondo (::backdrop).
      className="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-xl border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50"
      // React propaga `close` desde el <dialog> interno del visor de PDF ("Ampliar"): solo
      // cierra la vista previa el cierre de este diálogo.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) e.currentTarget.close();
        pressedOnBackdrop.current = false;
      }}
    >
      {preview ? (
        <div className="p-4">
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
        </div>
      ) : null}
    </dialog>
  );
}
