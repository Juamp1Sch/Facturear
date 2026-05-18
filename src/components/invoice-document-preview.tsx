"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

type InvoiceDocumentPreviewProps = {
  mimeType: string;
  previewUrl: string;
};

export function InvoiceDocumentPreview({
  mimeType,
  previewUrl,
}: InvoiceDocumentPreviewProps) {
  const isPdf = mimeType === "application/pdf";
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [pdfExpanded, setPdfExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, s - SCALE_STEP);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPdf || scale <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [isPdf, scale, pan.x, pan.y],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pdfExpanded) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pdfExpanded]);

  const closePdfDialog = useCallback(() => {
    setPdfExpanded(false);
  }, []);

  const scalePercent = Math.round(scale * 100);

  const openInNewTabLink = (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <ExternalLink />
      Abrir en nueva pestaña
    </a>
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!isPdf ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              aria-label="Alejar"
            >
              <Minus />
            </Button>
            <span className="min-w-14 text-center text-xs text-muted-foreground tabular-nums">
              {scalePercent}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              aria-label="Acercar"
            >
              <Plus />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetView}
              aria-label="Restablecer zoom"
            >
              <RotateCcw />
              Restablecer
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPdfExpanded(true)}
            >
              <Maximize2 />
              Ampliar
            </Button>
            {openInNewTabLink}
          </>
        )}
      </div>

      {isPdf ? (
        <iframe
          title="Factura PDF"
          src={previewUrl}
          className="h-[60vh] min-h-[320px] w-full rounded-md border border-border sm:h-[480px]"
        />
      ) : (
        <div
          className={cn(
            "relative h-[60vh] min-h-[320px] w-full overflow-auto rounded-md border border-border bg-muted/30 sm:h-[480px]",
            scale > 1 && (isDragging ? "cursor-grabbing" : "cursor-grab"),
          )}
          onMouseDown={handleMouseDown}
        >
          <div
            className="flex min-h-full min-w-full items-center justify-center p-2"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Factura"
              draggable={false}
              className={cn(
                "select-none rounded-md",
                scale === 1 ? "max-h-full max-w-full object-contain" : "max-w-none",
              )}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        </div>
      )}

      {isPdf ? (
        <dialog
          ref={dialogRef}
          className="fixed inset-0 z-50 m-0 h-full max-h-full w-full max-w-full border-0 bg-background/95 p-4 backdrop:bg-black/50 open:flex open:flex-col"
          onClose={closePdfDialog}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <span className="text-sm font-medium">Factura PDF</span>
            <div className="flex gap-2">
              {openInNewTabLink}
              <Button type="button" variant="outline" size="sm" onClick={closePdfDialog}>
                Cerrar
              </Button>
            </div>
          </div>
          <iframe
            title="Factura PDF ampliada"
            src={previewUrl}
            className="min-h-0 flex-1 w-full rounded-md border border-border"
          />
        </dialog>
      ) : null}
    </>
  );
}
