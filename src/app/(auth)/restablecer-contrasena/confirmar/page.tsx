import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = {
  title: "Nueva contraseña — AgileScan",
  description: "Ingresá el código y tu nueva contraseña de AgileScan.",
};

export default function ConfirmarRestablecerContrasenaPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
      <ResetPasswordForm />
    </main>
  );
}
