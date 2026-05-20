import { RequestPasswordResetForm } from "@/components/request-password-reset-form";

export const metadata = {
  title: "Restablecer contraseña — AgileScan",
  description: "Solicitá un código para restablecer tu contraseña de AgileScan.",
};

export default function RestablecerContrasenaPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <RequestPasswordResetForm />
    </main>
  );
}
