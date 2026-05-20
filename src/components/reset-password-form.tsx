"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPassword } from "@/actions/auth";
import { passwordRulesMessage } from "@/lib/auth-schemas";
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
      {pending ? "Guardando…" : "Restablecer contraseña"}
    </Button>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, undefined);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
        <CardDescription>
          Ingresá tu email, el código que te dio el administrador y tu nueva
          contraseña. El código vence a las 12 horas.
        </CardDescription>
      </CardHeader>
      <form action={action} className="contents">
        <CardContent className="space-y-4">
          {state?.message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
              {state.message.includes("expiró") ? (
                <>
                  {" "}
                  <Link
                    href="/restablecer-contrasena"
                    className="font-medium underline underline-offset-4"
                  >
                    Solicitar código nuevo
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
            <label htmlFor="token" className="text-sm font-medium">
              Código de restablecimiento
            </label>
            <Input
              id="token"
              name="token"
              type="text"
              autoComplete="off"
              required
              aria-invalid={Boolean(state?.errors?.token)}
            />
            {state?.errors?.token?.[0] ? (
              <p className="text-sm text-destructive">{state.errors.token[0]}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Nueva contraseña
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={Boolean(state?.errors?.password)}
            />
            {state?.errors?.password?.[0] ? (
              <p className="text-sm text-destructive">{state.errors.password[0]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{passwordRulesMessage}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Repetir contraseña
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={Boolean(state?.errors?.confirmPassword)}
            />
            {state?.errors?.confirmPassword?.[0] ? (
              <p className="text-sm text-destructive">
                {state.errors.confirmPassword[0]}
              </p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <SubmitButton />
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés código?{" "}
            <Link
              href="/restablecer-contrasena"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Solicitar uno
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
