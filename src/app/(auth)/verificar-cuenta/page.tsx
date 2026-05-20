import { VerifyAccountForm } from "@/components/verify-account-form";

export const metadata = {
  title: "Activar cuenta — AgileScan",
  description: "Activá tu cuenta de AgileScan con el código de registro.",
};

export default function VerificarCuentaPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <VerifyAccountForm />
    </main>
  );
}
