import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACCOUNTS = [
  { code: "6110", name: "Servicios de Telecomunicaciones", type: "Gasto" },
  { code: "6120", name: "Servicios de Energía Eléctrica", type: "Gasto" },
  { code: "6130", name: "Alquileres", type: "Gasto" },
  { code: "6140", name: "Honorarios Profesionales", type: "Gasto" },
  { code: "6150", name: "Mantenimiento y Reparaciones", type: "Gasto" },
  { code: "6160", name: "Suministros de Oficina", type: "Gasto" },
  { code: "6999", name: "Otros Gastos", type: "Gasto" },
];

async function main() {
  await prisma.user.deleteMany({
    where: { email: "demo@facturear.local" },
  });

  for (const acc of ACCOUNTS) {
    await prisma.accountingAccount.upsert({
      where: { code: acc.code },
      update: { name: acc.name, type: acc.type },
      create: acc,
    });
  }

  console.log("Seed completed: accounting accounts (users register via /registrarse).");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
