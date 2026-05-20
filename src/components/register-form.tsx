"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { register } from "@/actions/auth";
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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando cuenta…" : label}
    </Button>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(register, undefined);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Registrate para tener tu historial y facturas separadas de otros usuarios.
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
            <label htmlFor="name" className="text-sm font-medium">
              Nombre
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              aria-invalid={Boolean(state?.errors?.name)}
            />
            {state?.errors?.name?.[0] ? (
              <p className="text-sm text-destructive">{state.errors.name[0]}</p>
            ) : null}
          </div>
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
          <SubmitButton label="Registrarse" />
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <Link
              href="/iniciar-sesion"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Iniciar sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
