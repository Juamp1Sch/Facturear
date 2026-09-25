import type { Metadata } from "next";
import Link from "next/link";
import { FileText, History, Sparkles } from "lucide-react";

import { LandingFaq } from "@/components/landing-faq";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL, landingFaqJsonLd } from "@/lib/landing-faq-data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Datos estructurados del producto (Google: Organization + SoftwareApplication). */
function productJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/brand/logo-header.png`,
        email: CONTACT_EMAIL,
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "es-AR",
        description: SITE_DESCRIPTION,
      },
    ],
  };
}

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
            AgileScan lee facturas y remitos en PDF o foto, extrae CUIT, importes, IVA,
            percepciones y CAE, y te deja todo listo para la carga contable.
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
              Arrastrá y soltá o elegí archivo: PDF (digital o escaneado), JPG o PNG.
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

      <section className="border-y border-border bg-muted/40 px-4 py-16">
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

      <LandingFaq />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(landingFaqJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd()),
        }}
      />
    </div>
  );
}
