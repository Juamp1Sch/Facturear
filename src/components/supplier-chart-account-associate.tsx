"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import { savePresupuestoLetra } from "@/actions/presupuesto-settings";
import {
  removeSupplierChartAccountLink,
  saveSupplierChartAccountLinks,
  type AssociationFormData,
} from "@/actions/supplier-chart-accounts";
import { ChartAccountPicker } from "@/components/chart-account-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { associationLinkMatchesSearch } from "@/lib/association-link-search";
import { cn } from "@/lib/utils";

const LINKS_PAGE_SIZE = 15;

export function SupplierChartAccountAssociate({
  data,
  presupuestoLetra,
}: {
  data: AssociationFormData;
  presupuestoLetra: string | null;
}) {
  const router = useRouter();
  const [chartAccountId, setChartAccountId] = useState("");
  const [letra, setLetra] = useState(presupuestoLetra ?? "");
  const [letraError, setLetraError] = useState<string | null>(null);
  const [letraSuccess, setLetraSuccess] = useState<string | null>(null);
  const [letraPending, setLetraPending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [linksFilter, setLinksFilter] = useState("");
  const [linksPage, setLinksPage] = useState(1);

  const filteredLinks = useMemo(() => {
    if (!linksFilter.trim()) return data.links;
    return data.links.filter((l) => associationLinkMatchesSearch(l, linksFilter));
  }, [data.links, linksFilter]);

  const linksTotalPages = Math.max(1, Math.ceil(filteredLinks.length / LINKS_PAGE_SIZE));
  const linksPageSafe = Math.min(linksPage, linksTotalPages);

  const paginatedLinks = useMemo(() => {
    const start = (linksPageSafe - 1) * LINKS_PAGE_SIZE;
    return filteredLinks.slice(start, start + LINKS_PAGE_SIZE);
  }, [filteredLinks, linksPageSafe]);

  useEffect(() => {
    setLinksPage(1);
  }, [linksFilter]);

  useEffect(() => {
    if (linksPage > linksTotalPages) {
      setLinksPage(linksTotalPages);
    }
  }, [linksPage, linksTotalPages]);

  const filteredSuppliers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data.suppliers;
    return data.suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.cuit?.toLowerCase().includes(q) ?? false),
    );
  }, [data.suppliers, filter]);

  const toggleSupplier = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filteredSuppliers) next.add(s.id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  if (data.accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Primero importá el plan de cuentas en la pestaña «Importar plan».
      </p>
    );
  }

  if (data.suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay proveedores cargados. Importalos en Proveedores antes de asociar cuentas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <Card className="lg:flex-1 lg:max-w-2xl">
        <CardHeader>
          <CardTitle>Nueva asociación</CardTitle>
          <CardDescription>
            Elegí una cuenta y uno o más proveedores. Al leer una factura de esos proveedores, se
            asignará esa cuenta automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <form
            className="space-y-4"
            action={async (formData) => {
              setError(null);
              setSuccess(null);
              setPending(true);
              try {
                formData.set("chartAccountId", chartAccountId);
                for (const id of selected) {
                  formData.append("supplierIds", id);
                }
                const res = await saveSupplierChartAccountLinks(formData);
                if (res.ok) {
                  setSuccess(
                    `Asociación guardada: ${res.linked} proveedor${res.linked === 1 ? "" : "es"} vinculado${res.linked === 1 ? "" : "s"} a la cuenta.`,
                  );
                  setSelected(new Set());
                  router.refresh();
                } else {
                  setError(res.error);
                }
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="space-y-2">
              <label htmlFor="chartAccountId" className="text-sm font-medium">
                Cuenta
              </label>
              <ChartAccountPicker
                accounts={data.accounts}
                value={chartAccountId}
                onChange={setChartAccountId}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Escribí para filtrar por código o nombre; usá las flechas y Enter para elegir.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium">
                  Proveedores ({selected.size} seleccionado{selected.size === 1 ? "" : "s"})
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                    Seleccionar visibles
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                    Limpiar
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Buscar por código, nombre o CUIT…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <ul className="divide-y divide-border">
                  {filteredSuppliers.length === 0 ? (
                    <li className="px-3 py-4 text-sm text-muted-foreground">
                      Ningún proveedor coincide con la búsqueda.
                    </li>
                  ) : (
                    filteredSuppliers.map((s) => {
                      const checked = selected.has(s.id);
                      const existing = data.links.find((l) => l.supplierId === s.id);
                      return (
                        <li key={s.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/50",
                              checked && "bg-muted/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSupplier(s.id)}
                              className="mt-1 size-4 shrink-0 rounded border-input"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{s.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                Cód. {s.code}
                                {s.cuit ? ` · CUIT ${s.cuit}` : ""}
                                {existing
                                  ? ` · Actual: ${existing.chartAccountCode} — ${existing.chartAccountName}`
                                  : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            <Button type="submit" disabled={pending || !chartAccountId || selected.size === 0}>
              {pending ? "Guardando…" : "Guardar asociación"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:w-80 lg:shrink-0">
        <CardHeader>
          <CardTitle>Tipo de letra para Presupuestos</CardTitle>
          <CardDescription>
            Este es el tipo de letra asociado a los presupuestos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {letraError ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {letraError}
            </div>
          ) : null}
          {letraSuccess ? (
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
              {letraSuccess}
            </div>
          ) : null}

          <form
            className="space-y-4"
            action={async (formData) => {
              setLetraError(null);
              setLetraSuccess(null);
              setLetraPending(true);
              try {
                const res = await savePresupuestoLetra(formData);
                if (res.ok) {
                  setLetra(res.letra ?? "");
                  setLetraSuccess(
                    res.letra
                      ? `Letra guardada: ${res.letra}.`
                      : "Letra eliminada.",
                  );
                  router.refresh();
                } else {
                  setLetraError(res.error);
                }
              } finally {
                setLetraPending(false);
              }
            }}
          >
            <div className="space-y-2">
              <label htmlFor="presupuestoLetra" className="text-sm font-medium">
                Letra
              </label>
              <Input
                id="presupuestoLetra"
                name="letra"
                value={letra}
                onChange={(e) => setLetra(e.target.value.toUpperCase())}
                placeholder="Ej. X"
                maxLength={5}
                disabled={letraPending}
              />
            </div>

            <Button type="submit" disabled={letraPending}>
              {letraPending ? "Guardando…" : "Guardar Letra"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>

      {data.links.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-lg font-medium">Asociaciones actuales</h2>
            <div className="w-full sm:max-w-md">
              <label htmlFor="linksFilter" className="sr-only">
                Buscar asociaciones
              </label>
              <Input
                id="linksFilter"
                placeholder="Buscar por proveedor o cuenta (nombre o código)…"
                value={linksFilter}
                onChange={(e) => setLinksFilter(e.target.value)}
              />
            </div>
          </div>

          {filteredLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguna asociación coincide con la búsqueda.
            </p>
          ) : (
            <>
              <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="w-14" aria-label="Acciones" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLinks.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="font-medium">{l.supplierName}</span>
                          <span className="block text-xs text-muted-foreground">
                            Cód. {l.supplierCode}
                          </span>
                        </TableCell>
                        <TableCell>
                          {l.chartAccountCode} — {l.chartAccountName}
                        </TableCell>
                        <TableCell className="text-right">
                          <form
                            action={async (fd) => {
                              setError(null);
                              setSuccess(null);
                              const res = await removeSupplierChartAccountLink(fd);
                              if (res.ok) {
                                router.refresh();
                              } else {
                                setError(res.error);
                              }
                            }}
                          >
                            <input type="hidden" name="linkId" value={l.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Quitar asociación de ${l.supplierName}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <nav
                className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
                aria-label="Paginación de asociaciones"
              >
                <p className="text-sm text-muted-foreground">
                  Mostrando{" "}
                  <span className="font-medium text-foreground">
                    {(linksPageSafe - 1) * LINKS_PAGE_SIZE + 1}
                  </span>
                  –
                  <span className="font-medium text-foreground">
                    {Math.min(linksPageSafe * LINKS_PAGE_SIZE, filteredLinks.length)}
                  </span>{" "}
                  de{" "}
                  <span className="font-medium text-foreground">{filteredLinks.length}</span>
                  {linksTotalPages > 1 ? (
                    <>
                      {" "}
                      · página{" "}
                      <span className="font-medium text-foreground">{linksPageSafe}</span> de{" "}
                      <span className="font-medium text-foreground">{linksTotalPages}</span>
                    </>
                  ) : null}
                </p>

                {linksTotalPages > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={linksPageSafe <= 1}
                      onClick={() => setLinksPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={linksPageSafe >= linksTotalPages}
                      onClick={() => setLinksPage((p) => Math.min(linksTotalPages, p + 1))}
                    >
                      Siguiente
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </nav>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
