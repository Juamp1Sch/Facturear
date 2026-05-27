"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function cellText(v: string | null, empty = "-") {
  if (v == null || v.trim() === "") return empty;
  return v;
}

function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function parseCsvInput(value: string): string[] {
  if (!value.trim()) return [];
  return normalizeList(value.split(","));
}

function listText(values: string[]): string {
  if (values.length === 0) return "-";
  return values.join(", ");
}

export function SuppliersTable({
  suppliers,
  searchQuery = "",
}: {
  suppliers: SerializedSupplier[];
  searchQuery?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const pendingSubmitRef = useRef<FormData | null>(null);
  const [editing, setEditing] = useState<SerializedSupplier | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [empresasDraft, setEmpresasDraft] = useState("");
  const [sucursalesDraft, setSucursalesDraft] = useState("");

  useEffect(() => {
    if (!editing) return;
    setFormKey((k) => k + 1);
    setEmpresasDraft((editing.empresas ?? []).join(", "));
    setSucursalesDraft((editing.sucursales ?? []).join(", "));
    dialogRef.current?.showModal();
  }, [editing]);

  const closeDialog = useCallback(() => {
    confirmDialogRef.current?.close();
    pendingSubmitRef.current = null;
    dialogRef.current?.close();
    setEditing(null);
    setFormError(null);
  }, []);

  const submitUpdate = useCallback(
    async (formData: FormData) => {
      setFormError(null);
      const res = await updateSupplier(formData);
      if (res.ok) {
        closeDialog();
        router.refresh();
      } else {
        setFormError(res.error);
      }
    },
    [closeDialog, router],
  );

  const empresasList = useMemo(() => parseCsvInput(empresasDraft), [empresasDraft]);
  const sucursalesList = useMemo(() => parseCsvInput(sucursalesDraft), [sucursalesDraft]);

  if (suppliers.length === 0) {
    const q = searchQuery.trim();
    return (
      <p className="text-sm text-muted-foreground">
        {q
          ? `Ningún proveedor coincide con «${q}». Probá otro término o limpiá la búsqueda.`
          : "Todavía no tenés proveedores cargados. Usá la pestaña «Cargar proveedores» para importar el maestro."}
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
              <TableHead>Empresas</TableHead>
              <TableHead>Sucursales</TableHead>
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
                <TableCell className="max-w-[160px] truncate" title={listText(s.empresas)}>
                  {listText(s.empresas)}
                </TableCell>
                <TableCell className="max-w-[160px] truncate" title={listText(s.sucursales)}>
                  {listText(s.sucursales)}
                </TableCell>
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
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,32rem)] max-h-[min(90vh,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-0 shadow-lg backdrop:bg-black/45"
        onClose={() => {
          setEditing(null);
          setFormError(null);
        }}
      >
        {editing ? (
          <div className="p-5">
            <h2 className="text-lg font-semibold tracking-tight">Editar proveedor</h2>

            {formError ? (
              <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            ) : null}

            <form
              key={formKey}
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                formData.set("empresasJson", JSON.stringify(empresasList));
                formData.set("sucursalesJson", JSON.stringify(sucursalesList));
                const newCode = String(formData.get("code") ?? "").trim();
                if (newCode !== editing.code) {
                  pendingSubmitRef.current = formData;
                  confirmDialogRef.current?.showModal();
                  return;
                }
                await submitUpdate(formData);
              }}
            >
              <input type="hidden" name="supplierId" value={editing.id} />

              <div className="space-y-2">
                <label htmlFor="sup-code" className="text-sm font-medium">
                  Código
                </label>
                <Input id="sup-code" name="code" required defaultValue={editing.code} autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  Si lo cambiás, las facturas vinculadas se actualizarán con el nuevo código.
                </p>
              </div>
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

              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Asociaciones por CUIT</p>
                <p className="text-xs text-muted-foreground">Ingresá valores separados por coma (ej. 0001, 0002).</p>
                <div className="space-y-2">
                  <label htmlFor="sup-empresas" className="text-sm font-medium">Empresas</label>
                  <Input
                    id="sup-empresas"
                    value={empresasDraft}
                    onChange={(e) => setEmpresasDraft(e.target.value)}
                    disabled={!editing.cuit?.trim()}
                    placeholder={editing.cuit?.trim() ? "0001, 0002" : "Completá CUIT primero"}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="sup-sucursales" className="text-sm font-medium">Sucursales</label>
                  <Input
                    id="sup-sucursales"
                    value={sucursalesDraft}
                    onChange={(e) => setSucursalesDraft(e.target.value)}
                    disabled={!editing.cuit?.trim()}
                    placeholder={editing.cuit?.trim() ? "0001, 0002" : "Completá CUIT primero"}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="sup-address" className="text-sm font-medium">Dirección</label>
                <Input id="sup-address" name="address" defaultValue={editing.address ?? ""} />
              </div>
              <div className="space-y-2">
                <label htmlFor="sup-locality" className="text-sm font-medium">Localidad</label>
                <Input id="sup-locality" name="locality" defaultValue={editing.locality ?? ""} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit">Guardar</Button>
                <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              </div>
            </form>
          </div>
        ) : null}
      </dialog>

      <dialog
        ref={confirmDialogRef}
        className="fixed left-1/2 top-1/2 z-[60] w-[min(100%-1.5rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-0 shadow-lg backdrop:bg-black/45"
        onClose={() => {
          pendingSubmitRef.current = null;
        }}
      >
        <div className="p-5">
          <h3 className="text-base font-semibold tracking-tight">Confirmar cambio de código</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            ¿Estás seguro que querés guardar los cambios en el código del proveedor? Esto puede ocasionar diferencias con tu sistema destino.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={async () => {
                const formData = pendingSubmitRef.current;
                if (!formData) return;
                confirmDialogRef.current?.close();
                pendingSubmitRef.current = null;
                await submitUpdate(formData);
              }}
            >
              Sí, guardar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                confirmDialogRef.current?.close();
                pendingSubmitRef.current = null;
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
