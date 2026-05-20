"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  saveTaxChartAccountSettings,
  type TaxAssociationFormData,
} from "@/actions/tax-chart-accounts";
import { ChartAccountPicker } from "@/components/chart-account-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatAccountLabel(a: {
  code: string;
  name: string;
  type: string | null;
}): string {
  const typeSuffix = a.type ? ` (${a.type})` : "";
  return `${a.code} — ${a.name}${typeSuffix}`;
}

export function TaxChartAccountAssociate({ data }: { data: TaxAssociationFormData }) {
  const router = useRouter();
  const [vatChartAccountId, setVatChartAccountId] = useState(data.vatChartAccountId ?? "");
  const [perceptionIds, setPerceptionIds] = useState<Set<string>>(
    () => new Set(data.perceptionChartAccountIds),
  );
  const [perceptionAdderKey, setPerceptionAdderKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setVatChartAccountId(data.vatChartAccountId ?? "");
    setPerceptionIds(new Set(data.perceptionChartAccountIds));
  }, [data.vatChartAccountId, data.perceptionChartAccountIds]);

  const accountsById = useMemo(() => {
    const m = new Map<string, (typeof data.accounts)[number]>();
    for (const a of data.accounts) m.set(a.id, a);
    return m;
  }, [data.accounts]);

  const accountsForPerceptionAdder = useMemo(
    () => data.accounts.filter((a) => !perceptionIds.has(a.id)),
    [data.accounts, perceptionIds],
  );

  const orderedPerceptionIds = useMemo(() => {
    const withMeta = [...perceptionIds]
      .map((id) => accountsById.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    withMeta.sort((a, b) => a.code.localeCompare(b.code, "es"));
    return withMeta.map((a) => a.id);
  }, [perceptionIds, accountsById]);

  if (data.accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Primero importá el plan de cuentas en la pestaña «Importar plan».
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asociaciones de impuestos</CardTitle>
          <CardDescription>
            Elegí la cuenta del plan para IVA y una o más cuentas para percepciones. Al procesar
            la factura, la IA lee el desglose de cada renglón y el JSON contable arma una línea
            con cuenta y monto por cada importe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setSuccess(null);
              setPending(true);
              const formData = new FormData();
              formData.set("vatChartAccountId", vatChartAccountId);
              for (const id of orderedPerceptionIds) {
                formData.append("perceptionsChartAccountIds", id);
              }
              const res = await saveTaxChartAccountSettings(formData);
              setPending(false);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setSuccess("Asociaciones de impuestos guardadas.");
              router.refresh();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="vatChartAccountId" className="text-sm font-medium">
                Cuenta Impuestos (IVA)
              </label>
              <ChartAccountPicker
                inputId="vatChartAccountId"
                accounts={data.accounts}
                value={vatChartAccountId}
                onChange={setVatChartAccountId}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Se aplica a la línea contable cuando la factura tiene importe de IVA.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Cuentas Percepciones</p>
                <p className="text-xs text-muted-foreground">
                  Podés sumar varias cuentas. Aparecerán en el JSON como una línea por cuenta.
                </p>
              </div>

              {orderedPerceptionIds.length > 0 ? (
                <ul className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/30 p-2">
                  {orderedPerceptionIds.map((id) => {
                    const a = accountsById.get(id);
                    if (!a) return null;
                    return (
                      <li key={id}>
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-background px-2 py-1 text-xs ring-1 ring-border">
                          <span className="truncate" title={formatAccountLabel(a)}>
                            {formatAccountLabel(a)}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Quitar ${formatAccountLabel(a)}`}
                            disabled={pending}
                            onClick={() => {
                              setPerceptionIds((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }}
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Todavía no agregaste cuentas de percepciones.
                </p>
              )}

              {accountsForPerceptionAdder.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="perceptionAccountAdd">
                    Agregar cuenta
                  </label>
                  <ChartAccountPicker
                    key={perceptionAdderKey}
                    inputId="perceptionAccountAdd"
                    accounts={accountsForPerceptionAdder}
                    value=""
                    disabled={pending}
                    onChange={(id) => {
                      if (!id) return;
                      setPerceptionIds((prev) => {
                        const next = new Set(prev);
                        next.add(id);
                        return next;
                      });
                      setPerceptionAdderKey((k) => k + 1);
                    }}
                  />
                </div>
              ) : orderedPerceptionIds.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ya asociaste todas las cuentas activas del plan. Podés quitar alguna para agregar
                  otra.
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-green-700 dark:text-green-400" role="status">
                {success}
              </p>
            ) : null}

            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar asociaciones"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
