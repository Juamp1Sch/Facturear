# Facturear

## English

**Facturear** is a web app to **upload supplier invoices** (PDF or photos), **extract text from PDFs** when a text layer exists (`pdf-parse`), **extract structured fields from photos with OpenAI vision** (same fields as for PDFs), and **browse history** with search.

### Features (MVP)

- Upload: PDF, JPEG, PNG (max 10 MB).
- Storage: **Amazon S3** when `AWS_*` env vars are set; otherwise **local disk** (`.data/uploads/`) with `/api/files/...` for previews.
- Images: **OpenAI vision** (multimodal) for structured extraction; PDFs: **`pdf-parse`** for embedded text, then the same **OpenAI** structured output (Zod).
- Database: **PostgreSQL** + **Prisma** (`User`, `Invoice`, `AccountingAccount`, `Correction`).
- UI: **Next.js** (App Router) + **Tailwind CSS v4** + **shadcn/ui**.

### Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| App      | Next.js 16, React 19, TypeScript                |
| UI       | Tailwind CSS v4, shadcn/ui                      |
| DB       | PostgreSQL, Prisma ORM                          |
| Files    | AWS S3 or local `.data/uploads`                 |
| Text / AI | pdf-parse (PDF) + OpenAI vision + structured parse (Zod; `gpt-4o-mini` default) |

### Prerequisites

- Node.js 20+
- PostgreSQL database URL ([Neon](https://neon.tech) or any Postgres)
- OpenAI API key (vision-capable model, e.g. `gpt-4o-mini`)
- For **S3**: bucket + IAM user with `PutObject` / `GetObject`

### Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, OPENAI_API_KEY, etc.

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000/upload](http://localhost:3000/upload).

### Scripts

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run dev`        | Development server         |
| `npm run build`      | Production build           |
| `npm run start`      | Start production server    |
| `npm run db:push`    | Sync Prisma schema to DB   |
| `npm run db:seed`    | Seed demo user + accounts |
| `npm run db:migrate` | Create migrations (dev)    |

### Project layout

- `prisma/schema.prisma` — data model  
- `prisma/seed.ts` — demo user + default accounting accounts  
- `src/actions/invoices.ts` — `uploadInvoice` server action (pipeline)  
- `src/lib/` — db, storage, PDF text, AI, Zod schemas  
- `src/app/upload` — upload UI  
- `src/app/history` — list + filters  
- `src/app/history/[id]` — detail + preview  

### Roadmap

- Auth.js (multi-user)
- Manual corrections + `Correction` audit trail
- Dashboard (VAT, spend by vendor)
- Excel / CSV export
- AFIP CUIT validation, duplicate detection
- Stripe billing

---

## Español

**Facturear** es una aplicación web para **cargar facturas de proveedores** (PDF o fotos), **leer texto en PDFs** con capa de texto (`pdf-parse`), **extraer campos desde fotos con visión de OpenAI** y **ver el historial** con buscador.

### Funciones (MVP)

- Carga: PDF, JPEG, PNG (máx. 10 MB).
- Almacenamiento: **Amazon S3** si configurás las variables `AWS_*`; si no, **disco local** (`.data/uploads/`) y URLs vía `/api/files/...`.
- Fotos: **OpenAI visión** (multimodal); PDFs: **`pdf-parse`** si hay texto embebido, luego la misma **OpenAI** con salida estructurada (Zod).
- IA: **OpenAI** con salida estructurada (Zod).
- Base de datos: **PostgreSQL** + **Prisma**.

### Requisitos

- Node.js 20+
- URL de PostgreSQL
- API key de OpenAI (modelo con visión, p. ej. `gpt-4o-mini`)
- Para **S3**: bucket y credenciales IAM

### Instalación

```bash
cp .env.example .env
# Completá DATABASE_URL, OPENAI_API_KEY, etc.

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Entrá a [http://localhost:3000/upload](http://localhost:3000/upload).

### Notas

- El usuario por defecto del seed es `demo@facturear.local` (configurable con `DEFAULT_USER_EMAIL`).
- Los PDF **escaneados** (solo imagen, sin texto seleccionable) no aportan texto útil: conviene subirlos como **JPEG/PNG** para que la visión de OpenAI los lea, o usar un PDF con texto embebido.

### Próximos pasos (roadmap)

- Autenticación (Auth.js)
- Edición manual y registro de correcciones
- Panel y reportes
- Exportación Excel/CSV
- Validaciones AFIP y facturación (Stripe)
