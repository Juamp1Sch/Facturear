"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestPasswordReset } from "@/actions/auth";
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Solicitar código"}
    </Button>
  );
}

export function RequestPasswordResetForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Restablecer contraseña</CardTitle>
        <CardDescription>
          Ingresá el email de tu cuenta. El administrador recibirá un código para
          compartirte. Tenés 12 horas para usarlo.
        </CardDescription>
      </CardHeader>
      <form action={action} className="contents">
        <CardContent className="space-y-4">
          {state?.message ? (
            <p
              className={
                state.success
                  ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
                  : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              {state.message}
              {state.success ? (
                <>
                  {" "}
                  <Link
                    href="/restablecer-contrasena/confirmar"
                    className="font-medium underline underline-offset-4"
                  >
                    Ingresar código
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <SubmitButton />
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tenés el código?{" "}
            <Link
              href="/restablecer-contrasena/confirmar"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Restablecer contraseña
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/iniciar-sesion"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
