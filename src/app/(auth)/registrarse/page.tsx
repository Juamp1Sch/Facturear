import { RegisterForm } from "@/components/register-form";

export const metadata = {
  title: "Registrarse — AgileScan",
  description: "Creá tu cuenta en AgileScan.",
};

export default function RegistrarsePage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <RegisterForm />
    </main>
  );
}
