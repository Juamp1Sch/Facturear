import { RegisterForm } from "@/components/register-form";

export const metadata = {
  title: "Registrarse — Facturear",
  description: "Creá tu cuenta en Facturear.",
};

export default function RegistrarsePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <RegisterForm />
    </main>
  );
}
