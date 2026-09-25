import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth?.user);
  const path = req.nextUrl.pathname;
  const protectedPrefixes = ["/upload", "/history"];
  const authPages = [
    "/iniciar-sesion",
    "/registrarse",
    "/verificar-cuenta",
    "/restablecer-contrasena",
    "/restablecer-contrasena/confirmar",
  ];

  if (protectedPrefixes.some((p) => path.startsWith(p)) && !isLoggedIn) {
    const loginUrl = new URL("/iniciar-sesion", req.nextUrl);
    // Para volver a la página pedida después de iniciar sesión (se valida en la action).
    loginUrl.searchParams.set("callbackUrl", `${path}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (authPages.includes(path) && isLoggedIn) {
    return NextResponse.redirect(new URL("/upload", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/files|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
