import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "Iniciar sesión — AgileScan",
  description: "Accedé a tu cuenta de AgileScan.",
};

export default function IniciarSesionPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <LoginForm />
    </main>
  );
}
