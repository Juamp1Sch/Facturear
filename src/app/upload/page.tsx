import { DatabaseSetupCard } from "@/components/database-setup-card";
import { UploadForm } from "@/components/upload-form";
import { isDatabaseConfigured } from "@/lib/database-config";

export default function UploadPage() {
  const dbOk = isDatabaseConfigured();

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Cargar factura
      </h1>
      {!dbOk ? (
        <div className="mb-6">
          <DatabaseSetupCard variant="inline" />
        </div>
      ) : null}
      <UploadForm />
    </main>
  );
}
