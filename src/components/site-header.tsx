import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-4 py-3">
        <Link
          href="/upload"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand-subsection"
        >
          <span
            className="flex size-8 items-center justify-center rounded-lg bg-brand-logo text-sm font-bold text-white shadow-sm"
            aria-hidden
          >
            F
          </span>
          Facturear
        </Link>
        <nav className="flex gap-2 text-sm sm:gap-3">
          <Link
            href="/upload"
            className="rounded-full bg-brand-pill/35 px-3 py-1.5 font-medium text-brand-subsection transition-colors hover:bg-brand-pill/55 hover:text-brand-subsection"
          >
            Subir factura
          </Link>
          <Link
            href="/history"
            className="rounded-full px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-brand-section/15 hover:text-brand-subsection"
          >
            Historial
          </Link>
        </nav>
      </div>
    </header>
  );
}
