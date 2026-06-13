# Contexto del proyecto Facturear (para Claude Code y code review)

> **Este repo es Facturear, NO WMS.** Si en una sesión tenés cargado contexto de WMS
> (FastAPI + SQLModel + Alembic, warehouse/inventario/picking, multi-cliente), **ignoralo**:
> no aplica acá. Facturear es una app de **digitalización y carga contable de facturas**
> (Next.js 16 + Prisma + NextAuth, datos por-usuario). Ante la duda, este archivo manda.

## Qué es el producto

**Facturear** (dominio [agilescan.com.ar](https://agilescan.com.ar)): los usuarios suben facturas
(PDF/imagen), el sistema las digitaliza con OCR + IA (OpenAI), matchea proveedor y cuenta contable,
y opcionalmente las envía a un ERP externo. Cada usuario es un tenant: **todos los datos se filtran
por `session.user.id`**.

## Cómo distinguir Facturear de WMS (de un vistazo)

| | **Facturear** (este repo) | **WMS** (el otro) |
|---|---|---|
| Stack | Next.js 16 / React 19 / TypeScript | FastAPI (Python) + React/Vite |
| Datos | PostgreSQL vía **Prisma** | SQLModel/SQLAlchemy + **Alembic** |
| Auth | **NextAuth v5** (Credentials + JWT) | JWT propio (`app/core/security`) |
| Mutaciones | **Server Actions** (`src/actions/`) | Routers FastAPI + `services/db_functions` |
| Dominio | Facturas, proveedores, plan de cuentas | Inventario, ubicaciones, picking, carrito |
| Aislamiento | por `userId` (single-tenant por user) | por `client_id` / rol |

## Cómo se desarrolla

```bash
# Dev server (HMR) — el usuario suele tenerlo corriendo; los cambios se levantan solos
npm run dev

# Producción (prisma generate + next build) — NO correr sin pedir; el usuario tiene dev abierto
npm run build

# Lint
npm run lint

# Tests unitarios (Node test runner vía tsx)
npm run test:unit

# Prisma
npm run db:generate   # prisma generate
npm run db:migrate    # prisma migrate dev
npm run db:push       # prisma db push
npm run db:seed       # prisma db seed

# Generar AUTH_SECRET
npm run auth:secret
```

**Reglas operativas (heredadas de la convención del repo):**
- **Working directory:** no usar `cd`; usar rutas absolutas o `--prefix "C:/Users/Juan Pablo/Desktop/Facturear"`.
- **Build:** nunca correr `npm run build` sin pedir antes; el dev server toma los cambios solo.
- **`CLAUDE-LOCAL.md` / `CURSOR-LOCAL.md`:** si existen en la raíz, leerlos y seguirlos (config por máquina, git-ignored).

## Self-Verification (regla fuerte)

**Si hay algo que puedo verificar yo, lo verifico antes de decir que funciona.** Nada de
"probá ahora" / "debería andar" sin antes:
- Errores TS / lint → `npm run lint`
- Cambios de schema Prisma → `npm run db:generate` y revisar migraciones
- Server actions / API routes → trazar el camino y validar tipos
- Auth → verificar `auth()` y scoping por `session.user.id`

Solo pedir al usuario que pruebe cuando genuinamente no puedo (chequeos visuales de UI,
comportamiento de browser, integraciones solo-producción).

## Arquitectura

### Estructura

```
src/
├── app/                    # Next.js App Router (páginas + API routes)
│   ├── (auth)/             # Login, register, verify, password reset
│   ├── upload/             # Carga batch de facturas
│   ├── history/            # Lista + detalle de facturas
│   ├── proveedores/        # Maestro de proveedores
│   ├── cuentas/            # Plan de cuentas + asociaciones
│   ├── carga-*/            # Importación CSV/XLS
│   ├── api-config/         # Config de API ERP externa
│   └── api/                # Route handlers (auth, files, export)
├── actions/                # Server Actions ("use server") — patrón principal de mutación
├── components/             # Componentes de feature + ui/ (shadcn)
├── lib/                    # Lógica de dominio, integraciones, parsers
├── types/                  # Tipos compartidos + augmentación de NextAuth
├── auth.ts                 # Config Auth.js / NextAuth v5
└── proxy.ts                # Protección de rutas (Next.js 16 — NO hay middleware.ts)
prisma/
├── schema.prisma           # Modelo de datos
├── migrations/             # Migraciones SQL
└── seed.ts
scripts/                    # Scripts de mantenimiento / dev
```

### Stack

- **Framework:** Next.js 16.2.6, React 19, TypeScript (strict). **OJO:** Next.js 16 tiene breaking
  changes vs. lo que conozco de training. Ante dudas de API/convención, leer la guía en
  `node_modules/next/dist/docs/` antes de escribir código y respetar deprecations.
- **DB:** PostgreSQL vía Prisma 5 (`DATABASE_URL`). Cliente singleton en `src/lib/db.ts`.
- **Auth:** Auth.js / NextAuth v5 beta (Credentials + JWT, sesión 7 días).
- **Estilos:** Tailwind CSS v4 (CSS-first en `src/app/globals.css`), shadcn/ui + Base UI.
- **IA:** OpenAI (`gpt-4o-mini` por defecto) para extracción de facturas.
- **Storage:** AWS S3 → Neon `stored_files` → local `.data/uploads/` (orden de prioridad).
- **Email:** Nodemailer SMTP (aprobación de registro + reset de password).
- **Path alias:** `@/*` → `./src/*`.

### Patrones App Router

- **Server Components** por defecto — páginas `async`, llaman `await auth()` para la sesión.
- **Server Actions** (`src/actions/`) para todas las mutaciones.
- **API routes** solo cuando hace falta (protocolo Auth.js, servir binarios, export CSV/XLSX).
- `export const dynamic = "force-dynamic"` en páginas con mucha data.
- UI y slugs de URL en **español** (`/iniciar-sesion`, `/proveedores`, etc.).

## Autenticación

**Config:** `src/auth.ts`
- Provider: Credentials (email + password, bcrypt).
- Sesión: JWT, 7 días.
- Login requiere `emailVerifiedAt` (activación aprobada por admin).
- Secret: `AUTH_SECRET` (fallbacks `NEXTAUTH_SECRET` / `BETTER_AUTH_SECRET`). `trustHost: true`.

**Guard de rutas:** `src/proxy.ts` (patrón Next.js 16 — **no existe `middleware.ts`**)
- Protege: `/upload`, `/history` → redirige a `/iniciar-sesion`.
- Páginas de auth redirigen a `/upload` si ya estás logueado.
- Matcher excluye: `api/auth`, `api/files`, assets estáticos.

**Server actions de auth:** `src/actions/auth.ts` (register, verify, login, reset, logout).

**Regla:** toda query y mutación filtra por `session.user.id`. Nunca exponer datos de otro usuario.

## Modelos de datos

**Schema:** `prisma/schema.prisma` (PostgreSQL)

| Modelo | Propósito |
|--------|-----------|
| `User` | Identidad/auth; dueño de toda la data del tenant |
| `Invoice` | Entidad central — metadata de archivo, extracción OCR/IA, montos, campos fiscales, estado de subida a ERP |
| `InvoiceFile` | Facturas multi-parte (p.ej. dos fotos de la misma factura) |
| `StoredFile` | Blob binario en Postgres cuando no hay S3 |
| `Supplier` | Maestro de proveedores por usuario (`code`, `cuit`, `name`) |
| `SupplierAlias` | Mapeos aprendidos nombre → código de proveedor |
| `ChartAccount` | Plan de cuentas importado |
| `SupplierChartAccountLink` | Asociación proveedor → cuenta |
| `TaxChartAccountSettings` | Cuenta de IVA |
| `TaxChartAccountPerceptionLink` | Cuentas de percepciones |
| `IntegrationConfig` | URL + token de API ERP externa, por usuario |
| `CuitEmpresa` / `CuitSucursal` | Mapeos CUIT → empresa/sucursal |
| `Correction` | Auditoría de ediciones manuales de campos en facturas |
| `AccountingAccount` | Categorías de gasto globales legacy (seeded, mayormente superado) |

**Enum:** `InvoiceStatus` — `PROCESSING`, `READY`, `ERROR`, `CORRECTED`.

## Pipeline de procesamiento de facturas

Orquestado en `src/actions/invoices.ts`:

```
Upload → Guardar archivo → Extraer texto/visión → Parse OpenAI → Match proveedor
       → Resolver cuenta contable → Persistir → POST opcional a ERP
```

| Paso | Archivo | Detalle |
|------|---------|---------|
| 1. Guardar | `src/lib/storage.ts` | S3 → Neon `stored_files` → local `.data/uploads/` |
| 2. Texto PDF | `src/lib/ocr.ts` → `src/lib/pdf-text.ts` | `pdf-parse` para texto embebido |
| 3. Raster PDF | `src/lib/pdf-raster.ts` | `pdf-to-img` + `@napi-rs/canvas` para PDFs escaneados |
| 4. Extracción IA | `src/lib/ai.ts` | OpenAI texto + visión, parse estructurado con Zod |
| 5. Match proveedor | `src/lib/supplier-match.ts` | Matching por CUIT + alias |
| 6. Cuenta contable | `src/lib/chart-account-match.ts` | Resolución de cuenta |
| 7. Subida ERP | `src/actions/integration-upload.ts` | POST JSON contable con `X-Auth-Token` |

- **Schemas IA:** `src/lib/schemas.ts` (Zod).
- **Retry:** `src/lib/openai-retry.ts` (wrapper de rate-limit).
- **Serialización:** `src/lib/serialize-invoice.ts`, `src/lib/invoice-json.ts`.

## Integraciones

| Servicio | Archivo | Env vars |
|----------|---------|----------|
| OpenAI | `src/lib/ai.ts` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| AWS S3 | `src/lib/storage.ts` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` |
| SMTP | `src/lib/email.ts` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `REGISTRATION_NOTIFY_EMAIL` |
| ERP externo | `src/lib/integration-auth.ts` | Config por-usuario en `/api-config` |

Ver `.env.example` para la lista completa.

## API Routes

Solo existen 3 — preferir Server Actions para mutaciones nuevas.

| Ruta | Archivo | Propósito |
|------|---------|-----------|
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | Handlers de Auth.js |
| `/api/files/[...key]` | `src/app/api/files/[...key]/route.ts` | Servir archivos (auth + key scopeada al usuario) |
| `/api/history/export` | `src/app/api/history/export/route.ts` | Export CSV/XLSX |

## Server Actions

Todas en `src/actions/` con `"use server"`:

| Archivo | Propósito |
|---------|-----------|
| `auth.ts` | Register, verify, login, reset password, logout |
| `invoices.ts` | Upload, editar, listar, borrar facturas |
| `suppliers.ts` | CRUD de proveedores |
| `chart-accounts.ts` | CRUD de plan de cuentas |
| `supplier-chart-accounts.ts` | Links proveedor–cuenta |
| `tax-chart-accounts.ts` | Links de cuentas de IVA/percepciones |
| `api-config.ts` | Guardar/leer config de integración ERP |
| `integration-upload.ts` | POST de JSON de factura al ERP externo |

## Patrones clave

### Query scopeada por usuario
```typescript
const session = await auth();
if (!session?.user?.id) redirect("/iniciar-sesion");

const invoices = await prisma.invoice.findMany({
  where: { userId: session.user.id },
});
```

### Server Action
```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function myAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "No autorizado" };
  // ... mutación scopeada a session.user.id
}
```

### Organización de componentes
- Componentes de feature planos en `src/components/`; primitivos shadcn/ui en `src/components/ui/`.
- Shells que envuelven páginas relacionadas (`proveedores-shell.tsx`, `cuentas-shell.tsx`).
- Formularios usan `useActionState` de React con server actions.
- Utilidad `cn()` en `src/lib/utils.ts` (clsx + tailwind-merge).

### Librerías PDF en serverless
`next.config.ts` marca `pdf-parse`, `pdf-to-img`, `pdfjs-dist`, `@napi-rs/canvas` como
`serverExternalPackages`. **No importarlas en componentes cliente.**

## Variables de entorno

Referencia completa en `.env.example`. Críticas:

| Variable | Requerida | Propósito |
|----------|-----------|-----------|
| `DATABASE_URL` | Sí | Conexión PostgreSQL |
| `AUTH_SECRET` | Sí | Secret de firma JWT |
| `NEXT_PUBLIC_APP_URL` | Sí | Base URL para links de archivos |
| `OPENAI_API_KEY` | Sí (para IA) | Extracción de facturas |
| `SMTP_*` | Sí (para auth) | Emails de registro + reset |
| `AWS_*` / `S3_BUCKET_NAME` | Opcional | Storage S3 (producción) |

## Git workflow

**NUNCA pushear directo a `main`.** Siempre branch de feature desde `main`.

- **Nombre de branch:** `{descripcion-corta}` (ej. `invoice-fiscal-fields`, `fix-supplier-match`).
- **Formato de commit:** `[TYPE] Description` — Types: **ADD** (feature), **UPD** (mejora),
  **FIX** (bug), **WIP** (en progreso). Ej.: `[ADD] Fiscal document fields on invoice detail`.
- Antes de pushear: `git fetch origin` + `git rebase origin/main`.
- Toda PR incluye una sección `## How to Test` con, por cada cambio: **What changed**,
  **Manual test**, **Console command** (cuando se pueda) y una tabla **Before vs After**.
- Si la PR requiere acción manual post-merge (migración Prisma, env vars, seed), agregar
  `## Post-Deploy Steps`.

## Deployment

- **App:** Vercel (serverless).
- **DB:** Neon PostgreSQL (usar URL pooled en Vercel).
- **Files:** AWS S3 en producción; Neon `stored_files` o disco local como fallback.
- **Dominio:** [agilescan.com.ar](https://agilescan.com.ar).
- **Migraciones:** `prisma migrate deploy` en CI/CD o manual después del merge.

## Prioridades al hacer code review

1. **Seguridad / multi-tenant:** toda query y mutación filtrada por `session.user.id`; nunca
   filtrar datos entre usuarios. Verificar `auth()` en server actions y API routes.
2. **Server Actions vs API:** mutaciones nuevas como Server Actions, no API routes ad hoc.
3. **Prisma:** cambios de modelo → migración + compatibilidad de lecturas/escrituras. No romper
   el singleton de `src/lib/db.ts`.
4. **Next.js 16:** respetar el patrón `proxy.ts` (no `middleware.ts`), `serverExternalPackages`
   para libs PDF, Server Components async.
5. **Pipeline de facturas:** validar Zod en respuestas de IA; manejar errores de OCR/visión y
   rate-limits (usar `openai-retry`).
6. **Código muerto:** marcar funciones/imports/branches/endpoints que el cambio deja sin uso.
