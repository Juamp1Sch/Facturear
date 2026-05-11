import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DatabaseSetupCard({
  variant = "page",
}: {
  /** `page`: historial vacío. `inline`: aviso arriba del formulario de subida. */
  variant?: "page" | "inline";
}) {
  return (
    <Card
      className={cn(
        "border-brand-section/40 bg-muted/50",
        variant === "page" && "max-w-xl",
      )}
    >
      <CardHeader>
        <CardTitle className="text-brand-subsection">
          Falta configurar la base de datos
        </CardTitle>
        <CardDescription>
          Prisma necesita la variable{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-xs ring-1 ring-border">
            DATABASE_URL
          </code>{" "}
          para leer el historial y guardar facturas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Copiá{" "}
            <code className="rounded bg-background px-1 font-mono text-xs">
              .env.example
            </code>{" "}
            a <code className="rounded bg-background px-1 font-mono text-xs">.env</code>.
          </li>
          <li>
            Pegá tu URL de PostgreSQL (por ejemplo Neon) en{" "}
            <code className="rounded bg-background px-1 font-mono text-xs">
              DATABASE_URL=
            </code>
          </li>
          <li>
            En la terminal del proyecto:
            <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs text-foreground ring-1 ring-border">
{`npx prisma db push
npm run db:seed`}
            </pre>
          </li>
          <li>Reiniciá <code className="font-mono text-xs">npm run dev</code>.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
