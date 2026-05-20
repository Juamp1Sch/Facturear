"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { verifyRegistration } from "@/actions/auth";
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
      {pending ? "Activando…" : "Activar cuenta"}
    </Button>
  );
}

export function VerifyAccountForm() {
  const [state, action] = useActionState(verifyRegistration, undefined);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Activar cuenta</CardTitle>
        <CardDescription>
          Ingresá el email con el que te registraste y el código que te dio el
          administrador. El código vence a las 12 horas.
        </CardDescription>
      </CardHeader>
      <form action={action} className="contents">
        <CardContent className="space-y-4">
          {state?.message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
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
              Código de activación
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <SubmitButton />
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya activaste tu cuenta?{" "}
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
