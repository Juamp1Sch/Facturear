"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { updateSupplier } from "@/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SerializedSupplier } from "@/types/supplier";

function cellText(v: string | null, empty = "—") {
  if (v == null || v.trim() === "") return empty;
  return v;
}

export function SuppliersTable({ suppliers }: { suppliers: SerializedSupplier[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<SerializedSupplier | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!editing) return;
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  }, [editing]);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
    setEditing(null);
    setFormError(null);
  }, []);

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tenés proveedores cargados. Usá la pestaña «Cargar proveedores» para importar el
        maestro.
      </p>
    );
  }

  return (
    <>
      <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="whitespace-nowrap">CUIT</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Localidad</TableHead>
              <TableHead className="w-14 text-right" aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap font-medium">{s.code}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={s.name}>
                  {s.name}
                </TableCell>
                <TableCell className="whitespace-nowrap">{cellText(s.cuit)}</TableCell>
                <TableCell className="max-w-[180px] truncate" title={s.address ?? undefined}>
                  {cellText(s.address)}
                </TableCell>
                <TableCell className="max-w-[140px] truncate" title={s.locality ?? undefined}>
                  {cellText(s.locality)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    aria-label={`Editar proveedor ${s.code}`}
                    onClick={() => {
                      setFormError(null);
                      setEditing(s);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,26rem)] max-h-[min(90vh,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-0 shadow-lg backdrop:bg-black/45"
        onClose={() => {
          setEditing(null);
          setFormError(null);
        }}
      >
        {editing ? (
          <div className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Editar proveedor</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Código <span className="font-medium text-foreground">{editing.code}</span> (no se
              puede cambiar)
            </p>

            {formError ? (
              <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            ) : null}

            <form
              key={formKey}
              className="mt-4 space-y-3"
              action={async (formData) => {
                setFormError(null);
                const res = await updateSupplier(formData);
                if (res.ok) {
                  closeDialog();
                  router.refresh();
                } else {
                  setFormError(res.error);
                }
              }}
            >
              <input type="hidden" name="supplierId" value={editing.id} />

              <div className="space-y-2">
                <label htmlFor="sup-name" className="text-sm font-medium">
                  Nombre
                </label>
                <Input id="sup-name" name="name" required defaultValue={editing.name} />
              </div>
              <div className="space-y-2">
                <label htmlFor="sup-cuit" className="text-sm font-medium">
                  CUIT
                </label>
                <Input
                  id="sup-cuit"
                  name="cuit"
                  defaultValue={editing.cuit ?? ""}
                  placeholder="Vacío si no aplica"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  11 dígitos o vacío. Se usa para cruzar con facturas y como ayuda a la IA.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="sup-address" className="text-sm font-medium">
                  Dirección
                </label>
                <Input id="sup-address" name="address" defaultValue={editing.address ?? ""} />
              </div>
              <div className="space-y-2">
                <label htmlFor="sup-locality" className="text-sm font-medium">
                  Localidad
                </label>
                <Input id="sup-locality" name="locality" defaultValue={editing.locality ?? ""} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit">Guardar</Button>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
