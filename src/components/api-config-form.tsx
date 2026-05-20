"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { saveApiConfig, type ApiConfigPublic } from "@/actions/api-config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ApiConfigForm({ initial }: { initial: ApiConfigPublic | null }) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? "");
  const [userToken, setUserToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const hasStoredToken = initial?.hasToken ?? false;

  useEffect(() => {
    setApiUrl(initial?.apiUrl ?? "");
  }, [initial?.apiUrl]);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Integración con tu sistema de destino</CardTitle>
        <CardDescription>
          La URL y el token los provee tu sistema de destino. Guardalos una vez;
          podés cambiarlos cuando pases de desarrollo a producción.
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
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSuccess(null);
            setPending(true);
            try {
              const formData = new FormData();
              formData.set("apiUrl", apiUrl);
              formData.set("userToken", userToken);
              const res = await saveApiConfig(formData);
              if (res.ok) {
                setSuccess("Configuración guardada correctamente.");
                setUserToken("");
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
            <label htmlFor="apiUrl" className="text-sm font-medium">
              URL para importar (API)
            </label>
            <Input
              id="apiUrl"
              name="apiUrl"
              type="url"
              required
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://tu-sistema.com/.../import"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              URL del endpoint de importación que te entrega tu sistema de destino.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="userToken" className="text-sm font-medium">
              Token usuario
            </label>
            <div className="relative">
              <Input
                id="userToken"
                name="userToken"
                type={showToken ? "text" : "password"}
                required={!hasStoredToken}
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                placeholder={
                  hasStoredToken
                    ? "Pegá un token nuevo para reemplazar el guardado"
                    : "Copiá acá el token que te dio tu sistema de destino"
                }
                autoComplete="off"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {hasStoredToken ? (
              <p className="text-xs text-muted-foreground">
                Hay un token guardado. Para cambiarlo, pegá el nuevo y guardá.
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
