export type SerializedSupplier = {
  id: string;
  code: string;
  name: string;
  cuit: string | null;
  address: string | null;
  locality: string | null;
  /** Empresas asociadas al CUIT (compartidas entre proveedores con mismo CUIT). */
  empresas: string[];
  sucursales: string[];
};

/** Subconjunto del maestro usado en el picker de edición de facturas. */
export type SupplierPickerOption = Pick<
  SerializedSupplier,
  "id" | "code" | "name" | "cuit"
>;
