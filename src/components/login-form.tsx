"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Ingresando…" : label}
    </Button>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const activated = searchParams.get("activada") === "1";
  const passwordReset = searchParams.get("contrasena") === "1";
  const callbackUrl = searchParams.get("callbackUrl") ?? "";
  const [state, action] = useActionState(login, undefined);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>
          Ingresá con tu email y contraseña para ver tu historial y cargar facturas.
        </CardDescription>
      </CardHeader>
      <form action={action} className="contents">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <CardContent className="space-y-4">
          {activated ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              Cuenta activada. Ya podés iniciar sesión.
            </p>
          ) : null}
          {passwordReset ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              Contraseña actualizada. Ya podés iniciar sesión.
            </p>
          ) : null}
          {state?.message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
              {state.pendingActivation ? (
                <>
                  {" "}
                  <Link
                    href="/verificar-cuenta"
                    className="font-medium underline underline-offset-4"
                  >
                    Activar cuenta
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(state?.errors?.email)}
            />
            {state?.errors?.email?.[0] ? (
              <p className="text-sm text-destructive">{state.errors.email[0]}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state?.errors?.password)}
            />
            {state?.errors?.password?.[0] ? (
              <p className="text-sm text-destructive">{state.errors.password[0]}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <SubmitButton label="Iniciar sesión" />
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link
              href="/registrarse"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Registrate
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            ¿Olvidaste tu contraseña?{" "}
            <Link
              href="/restablecer-contrasena"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Restablecela
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            ¿Tenés código de activación?{" "}
            <Link
              href="/verificar-cuenta"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Activar cuenta
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
