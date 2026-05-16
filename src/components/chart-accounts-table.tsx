import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SerializedChartAccount } from "@/types/chart-account";

export function ChartAccountsTable({ accounts }: { accounts: SerializedChartAccount[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tenés cuentas cargadas. Usá la pestaña «Importar plan» para subir el Excel o
        CSV del plan de cuentas.
      </p>
    );
  }

  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Cuenta</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="whitespace-nowrap">Tipo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap font-medium">{a.code}</TableCell>
              <TableCell className="max-w-[280px] truncate" title={a.name}>
                {a.name}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {a.type ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
