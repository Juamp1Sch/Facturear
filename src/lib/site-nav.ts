export type SiteNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  match: (pathname: string) => boolean;
};

export const loggedInNavItems: SiteNavItem[] = [
  {
    href: "/upload",
    label: "Subir factura",
    shortLabel: "Subir",
    match: (pathname) => {
      const onHistory = pathname.startsWith("/history");
      const onSuppliers =
        pathname.startsWith("/proveedores") || pathname.startsWith("/carga-proveedores");
      const onAccounts =
        pathname.startsWith("/cuentas") || pathname.startsWith("/carga-cuentas");
      return !onHistory && !onSuppliers && !onAccounts;
    },
  },
  {
    href: "/history",
    label: "Historial",
    match: (pathname) => pathname.startsWith("/history"),
  },
  {
    href: "/proveedores",
    label: "Proveedores",
    shortLabel: "Prov.",
    match: (pathname) =>
      pathname.startsWith("/proveedores") || pathname.startsWith("/carga-proveedores"),
  },
  {
    href: "/cuentas",
    label: "Cuentas",
    match: (pathname) =>
      pathname.startsWith("/cuentas") || pathname.startsWith("/carga-cuentas"),
  },
];

export const guestNavItems: SiteNavItem[] = [
  {
    href: "/iniciar-sesion",
    label: "Iniciar sesión",
    match: (pathname) => pathname.startsWith("/iniciar-sesion"),
  },
  {
    href: "/registrarse",
    label: "Registrarse",
    match: (pathname) => pathname.startsWith("/registrarse"),
  },
];
