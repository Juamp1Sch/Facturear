# Facturear

## English

**Facturear** is a web app to **upload supplier invoices** (PDF or photos), run **OCR** (Google Cloud Vision for images; text layer extraction for PDFs), **extract structured fields with OpenAI** (provider, CUIT, date, amounts, invoice type, suggested chart of accounts), and **browse history** with search.

### Features (MVP)

- Upload: PDF, JPEG, PNG (max 10 MB).
- Storage: **Amazon S3** when `AWS_*` env vars are set; otherwise **local disk** (`.data/uploads/`) with `/api/files/...` for previews.
- OCR / text: **Google Vision** for images; **`pdf-parse`** for text-based PDFs.
- AI: **OpenAI** structured output (Zod) for normalized invoice data.
- Database: **PostgreSQL** + **Prisma** (`User`, `Invoice`, `AccountingAccount`, `Correction`).
- UI: **Next.js** (App Router) + **Tailwind CSS v4** + **shadcn/ui**.

### Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| App      | Next.js 16, React 19, TypeScript                |
| UI       | Tailwind CSS v4, shadcn/ui                      |
| DB       | PostgreSQL, Prisma ORM                          |
| Files    | AWS S3 or local `.data/uploads`                 |
| OCR      | Google Cloud Vision + pdf-parse (PDF text)      |
| AI       | OpenAI (`gpt-4o-mini` by default)               |

### Prerequisites

- Node.js 20+
- PostgreSQL database URL ([Neon](https://neon.tech) or any Postgres)
- OpenAI API key
- For **image** OCR: Google Cloud project with Vision API + service account JSON  
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
- `src/lib/` — db, storage, OCR, AI, Zod schemas  
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

**Facturear** es una aplicación web para **cargar facturas de proveedores** (PDF o fotos), ejecutar **OCR** (Google Cloud Vision en imágenes; extracción de texto en PDFs con capa de texto), **extraer campos estructurados con OpenAI** (proveedor, CUIT, fecha, importes, tipo de comprobante, cuenta contable sugerida) y **ver el historial** con buscador.

### Funciones (MVP)

- Carga: PDF, JPEG, PNG (máx. 10 MB).
- Almacenamiento: **Amazon S3** si configurás las variables `AWS_*`; si no, **disco local** (`.data/uploads/`) y URLs vía `/api/files/...`.
- OCR / texto: **Google Vision** en imágenes; **`pdf-parse`** en PDFs con texto embebido.
- IA: **OpenAI** con salida estructurada (Zod).
- Base de datos: **PostgreSQL** + **Prisma**.

### Requisitos

- Node.js 20+
- URL de PostgreSQL
- API key de OpenAI
- Para OCR de **fotos**: proyecto en Google Cloud con Vision API + JSON de cuenta de servicio  
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
- Los PDF **escaneados** (solo imagen) no pasan por Vision en este MVP: conviene subirlos como **imagen** o usar un PDF con texto seleccionable.

### Próximos pasos (roadmap)

- Autenticación (Auth.js)
- Edición manual y registro de correcciones
- Panel y reportes
- Exportación Excel/CSV
- Validaciones AFIP y facturación (Stripe)
