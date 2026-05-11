# Facturear

## English

**Facturear** is a web app to **upload supplier invoices** (PDF or photos), **extract text from PDFs** when a text layer exists (`pdf-parse`), **extract structured fields from photos with OpenAI vision** (same fields as for PDFs), and **browse history** with search.

### Features (MVP)

- Upload: PDF, JPEG, PNG (max 10 MB).
- Storage: **Amazon S3** when `AWS_*` env vars are set; otherwise **local disk** (`.data/uploads/`) with `/api/files/...` for previews.
- Images: **OpenAI vision** (multimodal) for structured extraction; PDFs: **`pdf-parse`** for embedded text, then the same **OpenAI** structured output (Zod).
- Database: **PostgreSQL** + **Prisma** (`User`, `Invoice`, `AccountingAccount`, `Correction`).
- Auth: **Auth.js / NextAuth v5** (credentials + JWT); each user only sees their own invoices.
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
# Edit .env: DATABASE_URL, OPENAI_API_KEY, AUTH_SECRET (e.g. npx auth secret), AUTH_TRUST_HOST=true for local dev

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/) (landing), register at `/registrarse`, then use **Upload** at `/upload`.

### Scripts

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run dev`        | Development server         |
| `npm run build`      | Production build           |
| `npm run start`      | Start production server    |
| `npm run db:push`    | Sync Prisma schema to DB   |
| `npm run db:seed`    | Seed accounting accounts + remove legacy demo user |
| `npm run db:migrate` | Create migrations (dev)    |

### Project layout

- `prisma/schema.prisma` — data model  
- `prisma/seed.ts` — default accounting accounts  
- `src/auth.ts` — Auth.js config; `src/proxy.ts` — route protection  
- `src/actions/invoices.ts` — `uploadInvoice` server action (pipeline)  
- `src/lib/` — db, storage, PDF text, AI, Zod schemas  
- `src/app/upload` — upload UI  
- `src/app/history` — list + filters  
- `src/app/history/[id]` — detail + preview  

### Roadmap

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
- Cuentas: **Auth.js** (email/contraseña); historial y facturas por usuario.

### Requisitos

- Node.js 20+
- URL de PostgreSQL
- API key de OpenAI (modelo con visión, p. ej. `gpt-4o-mini`)
- Para **S3**: bucket y credenciales IAM

### Instalación

```bash
cp .env.example .env
# Completá DATABASE_URL, OPENAI_API_KEY, AUTH_SECRET (p. ej. npx auth secret), AUTH_TRUST_HOST=true en local

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Entrá a [http://localhost:3000/](http://localhost:3000/), registrate en `/registrarse` y luego cargá facturas en `/upload`.

### Notas

- Necesitás `AUTH_SECRET` en `.env` (ver `.env.example`). `npm run db:seed` elimina el usuario legacy `demo@facturear.local` si existía.
- Los PDF **escaneados** (solo imagen, sin texto seleccionable) no aportan texto útil: conviene subirlos como **JPEG/PNG** para que la visión de OpenAI los lea, o usar un PDF con texto embebido.

### Próximos pasos (roadmap)

- Edición manual y registro de correcciones
- Panel y reportes
- Exportación Excel/CSV
- Validaciones AFIP y facturación (Stripe)
