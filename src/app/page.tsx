import Link from "next/link";
import { FileText, History, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <section className="border-b border-border bg-gradient-to-b from-secondary/80 to-background px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-brand-section">
            Facturas de proveedores, sin fricción
          </p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-brand-subsection sm:text-4xl md:text-5xl">
            Subí, extraé y organizá tus facturas con IA
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            AgileScan lee PDFs y fotos, completa los datos clave y te deja un historial
            propio: cada usuario ve solo lo suyo.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/registrarse"
              className={cn(buttonVariants({ size: "lg" }), "min-w-[11rem]")}
            >
              Registrarse
            </Link>
            <Link
              href="/iniciar-sesion"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-w-[11rem]",
              )}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="mb-10 text-center text-2xl font-semibold text-brand-subsection">
          Todo lo que necesitás para tu contabilidad diaria
        </h2>
        <ul className="grid gap-6 sm:grid-cols-3">
          <li className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-logo text-white">
              <FileText className="size-6" aria-hidden />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-brand-subsection">
              Subí PDF o foto
            </h3>
            <p className="text-sm text-muted-foreground">
              Arrastrá y soltá o elegí archivo. PDF con texto, JPG o PNG hasta 10 MB.
            </p>
          </li>
          <li className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-logo text-white">
              <Sparkles className="size-6" aria-hidden />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-brand-subsection">
              IA extrae los datos
            </h3>
            <p className="text-sm text-muted-foreground">
              Proveedor, CUIT, importes, fecha y cuenta sugerida con confianza estimada.
            </p>
          </li>
          <li className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-logo text-white">
              <History className="size-6" aria-hidden />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-brand-subsection">
              Historial por usuario
            </h3>
            <p className="text-sm text-muted-foreground">
              Iniciá sesión y accedé solo a tus facturas: privacidad entre cuentas.
            </p>
          </li>
        </ul>
      </section>

      <section className="border-t border-border bg-muted/40 px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <h2 className="mb-3 text-2xl font-semibold text-brand-subsection">
            Empezá gratis en minutos
          </h2>
          <p className="mb-8 text-muted-foreground">
            Creá tu cuenta, subí la primera factura y revisá el detalle con vista previa
            del archivo.
          </p>
          <Link href="/registrarse" className={cn(buttonVariants({ size: "lg" }))}>
            Crear cuenta
          </Link>
        </div>
      </section>
    </div>
  );
}
