"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet, Upload } from "lucide-react";

import { importSuppliersMaster } from "@/actions/suppliers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SuppliersImportForm({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFileName(f.name);
    setError(null);
    setSuccess(null);
    setWarnings([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    validator: (file) => {
      const name = file.name.toLowerCase();
      const ok = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
      if (ok) return null;
      return { code: "file-invalid-type", message: "Solo CSV, XLS o XLSX." };
    },
    maxFiles: 1,
    maxSize: 8 * 1024 * 1024,
    multiple: false,
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Importar maestro</CardTitle>
        <CardDescription>
          Excel o CSV con al menos código y nombre. Dirección, localidad y CUIT son opcionales.
          Si cargás CUIT en el maestro, al leer facturas la IA puede usarlo como referencia
          cuando el emisor coincide; el cruce automático del código de proveedor en la factura
          sigue basándose en el CUIT del comprobante cuando ambos coinciden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Proveedores cargados:{" "}
          <span className="font-medium text-foreground">{initialCount}</span>
        </p>

        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            {success}
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              Filas omitidas o con avisos ({warnings.length})
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              {warnings.map((w, i) => (
                <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <form
          className="space-y-4"
          action={async (formData) => {
            setError(null);
            setSuccess(null);
            setWarnings([]);
            setPending(true);
            try {
              const res = await importSuppliersMaster(formData);
              if (res.ok) {
                setSuccess(
                  `Listo: ${res.processed} filas procesadas (${res.created} nuevas, ${res.updated} actualizadas por código). Sin duplicados: mismo código que ya existía solo se actualiza. Las facturas se re-cruzan si el CUIT del comprobante coincide con un proveedor que tenga CUIT en el maestro.`,
                );
                if (res.issueSample.length > 0) {
                  setWarnings(res.issueSample);
                }
                setFileName(null);
                router.refresh();
              } else {
                setError(res.error);
              }
            } finally {
              setPending(false);
            }
          }}
        >
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors",
              isDragActive && "border-primary bg-muted/60",
            )}
          >
            <input {...getInputProps({ name: "file", required: true })} />
            <Upload className="mb-2 size-9 text-muted-foreground" />
            <p className="text-sm font-medium">Arrastrá o elegí archivo</p>
            <p className="mt-1 text-xs text-muted-foreground">CSV, XLS o XLSX · máx. 8 MB</p>
          </div>

          {fileName ? (
            <p className="text-sm text-muted-foreground">
              Seleccionado: <span className="font-medium text-foreground">{fileName}</span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4 shrink-0" />
              Elegí el maestro exportado desde tu sistema.
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Importando…" : "Importar proveedores"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
