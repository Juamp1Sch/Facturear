"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function TaxChartAccountAssociate({ data }: { data: TaxAssociationFormData }) {
  const router = useRouter();
  const [vatChartAccountId, setVatChartAccountId] = useState(data.vatChartAccountId ?? "");
  const [perceptionIvaChartAccountId, setPerceptionIvaChartAccountId] = useState(
    data.perceptionIvaChartAccountId ?? "",
  );
  const [perceptionIibbChartAccountId, setPerceptionIibbChartAccountId] = useState(
    data.perceptionIibbChartAccountId ?? "",
  );
  const [bonificacionChartAccountId, setBonificacionChartAccountId] = useState(
    data.bonificacionChartAccountId ?? "",
  );
  const [ignoreBonificaciones, setIgnoreBonificaciones] = useState(
    data.ignoreBonificaciones,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setVatChartAccountId(data.vatChartAccountId ?? "");
    setPerceptionIvaChartAccountId(data.perceptionIvaChartAccountId ?? "");
    setPerceptionIibbChartAccountId(data.perceptionIibbChartAccountId ?? "");
    setBonificacionChartAccountId(data.bonificacionChartAccountId ?? "");
    setIgnoreBonificaciones(data.ignoreBonificaciones);
  }, [
    data.vatChartAccountId,
    data.perceptionIvaChartAccountId,
    data.perceptionIibbChartAccountId,
    data.bonificacionChartAccountId,
    data.ignoreBonificaciones,
  ]);

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
            Elegí la cuenta del plan para IVA, las de percepciones (IVA e IIBB por separado) y la
            de bonificación. Al procesar la factura, la IA lee el desglose de cada renglón y el
            JSON contable arma una línea con cuenta y monto por cada importe.
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
              formData.set("perceptionIvaChartAccountId", perceptionIvaChartAccountId);
              formData.set("perceptionIibbChartAccountId", perceptionIibbChartAccountId);
              formData.set("bonificacionChartAccountId", bonificacionChartAccountId);
              if (ignoreBonificaciones) {
                formData.set("ignoreBonificaciones", "on");
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

            <div className="space-y-2">
              <label htmlFor="perceptionIvaChartAccountId" className="text-sm font-medium">
                Cuenta Percepción IVA (PIV)
              </label>
              <ChartAccountPicker
                inputId="perceptionIvaChartAccountId"
                accounts={data.accounts}
                value={perceptionIvaChartAccountId}
                onChange={setPerceptionIvaChartAccountId}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Recibe los renglones de percepción de IVA (tipoImpuesto PIV en el JSON).
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="perceptionIibbChartAccountId" className="text-sm font-medium">
                Cuenta Percepción IIBB (PIB)
              </label>
              <ChartAccountPicker
                inputId="perceptionIibbChartAccountId"
                accounts={data.accounts}
                value={perceptionIibbChartAccountId}
                onChange={setPerceptionIibbChartAccountId}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Recibe los renglones de percepción de Ingresos Brutos (tipoImpuesto PIB en el JSON).
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="bonificacionChartAccountId" className="text-sm font-medium">
                Cuenta bonificación
              </label>
              <ChartAccountPicker
                inputId="bonificacionChartAccountId"
                accounts={data.accounts}
                value={bonificacionChartAccountId}
                onChange={setBonificacionChartAccountId}
                disabled={pending || ignoreBonificaciones}
              />
              <p className="text-xs text-muted-foreground">
                Se aplica a bonificaciones o descuentos del comprobante (tipoImpuesto EXE en el
                JSON contable).
              </p>

              <label className="flex items-start gap-2 pt-1 text-sm">
                <input
                  type="checkbox"
                  checked={ignoreBonificaciones}
                  onChange={(e) => setIgnoreBonificaciones(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span>
                  <span className="font-medium">No tener en cuenta bonificaciones</span>
                  <span className="block text-xs text-muted-foreground">
                    Aunque la IA las lea, las bonificaciones no se muestran en la factura ni
                    generan líneas en el JSON que se exporta a la API.
                  </span>
                </span>
              </label>
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
