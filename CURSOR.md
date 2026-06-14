# CURSOR.md

This file provides guidance to Cursor when working with code in this repository.

## Response Style

Write as little as possible. Keep replies human-readable: short sentences, short answers, no walls of text. Only expand when I ask for more detail, or when you genuinely need longer reasoning to think through a hard problem. Don't pad answers with summaries, recaps, or "here's what I did" blocks.

## Next.js 16 Warning

This is **not** the Next.js you know from training data. Next.js 16 has breaking changes — APIs, conventions, and file structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. See also [AGENTS.md](AGENTS.md).

## Local Configuration

If a `CURSOR-LOCAL.md` file exists in the project root, read it and follow its instructions. It contains environment-specific context (e.g., local paths, credentials) that varies per machine and is git-ignored.

## Git Workflow

**NEVER push directly to `main`.** Always create a feature branch.

**Branch naming:** `{short-description}` (e.g., `invoice-fiscal-fields`, `fix-supplier-match`)

**Commit message format:** `[TYPE] Description`
- Types: **ADD** (new feature), **UPD** (enhancement), **FIX** (bug fix), **WIP** (work in progress)
- Example: `[ADD] Fiscal document fields on invoice detail`
- Example: `[FIX] Supplier match when CUIT has dashes`

**Workflow:**
```bash
# 1. Create a feature branch from main
git checkout -b invoice-fiscal-fields origin/main

# 2. Make commits
git add <files>
git commit -m "[ADD] Description"

# 3. Before pushing, rebase with latest main
git fetch origin
git rebase origin/main

# 4. Push and create PR
git push -u origin invoice-fiscal-fields
gh pr create --title "[ADD] Description" --body "..."
```

**PR "How to Test" section:** Every PR MUST include a `## How to Test` section in the body with step-by-step testing instructions for each change. Every single item MUST have ALL four parts — no exceptions:
- **What changed** — one sentence explaining the fix
- **Manual test** — what to open, where to look, what to check
- **Console command** — a snippet to verify programmatically when possible (e.g., API call, Prisma query, or browser console check)
- **Before vs After table** — expected behavior before and after the change

Example format:
```markdown
### Fix: Supplier CUIT normalization
**What changed:** CUITs with dashes now match the supplier master.
**Manual:** Upload an invoice with CUIT `20-12345678-9` → check supplier auto-match on detail page.
**Console:**
\`\`\`js
// On invoice detail page — supplier code should be set
document.querySelector('[data-supplier-code]')?.textContent
\`\`\`
| | Expected |
|---|---|
| Before | Supplier not matched, code empty |
| After | Supplier matched, code populated |
```

**Post-deploy steps:** If the PR requires manual action after merging (Prisma migration, env var changes, seed data), include a `## Post-Deploy Steps` section. Only add when actually needed.

## IMPORTANT: Working Directory

**NEVER change the working directory with `cd` commands.** Always use absolute paths for all file operations and commands. The working directory should remain at the project root.

When running commands that require a specific directory, use absolute paths or `--prefix`:
```bash
# CORRECT
npm run dev --prefix "C:/Users/Juan Pablo/Desktop/Facturear"

# WRONG — don't cd
cd src && npm run dev
```

## Build Commands

**NEVER run `npm run build` without asking first.** The user typically has `npm run dev` running, which picks up changes automatically. Only run build commands when explicitly asked.

```bash
# Dev server (HMR)
npm run dev

# Production build (prisma generate + next build)
npm run build

# Lint
npm run lint

# Prisma
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev
npm run db:push        # prisma db push
npm run db:seed        # prisma db seed

# Auth secret generator
npm run auth:secret
```

## Self-Verification Rule

**If there is ANYTHING you can verify yourself, you MUST verify it before telling the user it works.** Never say "try it now" or "it should work" — run the test yourself first. This applies to:
- TypeScript / lint errors → run `npm run lint`
- Build errors → only run `npm run build` when asked or when lint is insufficient
- Prisma schema changes → run `npm run db:generate` and check for migration issues
- Server actions / API routes → trace the code path and validate types
- Auth flows → verify `auth()` checks and `session.user.id` scoping

Only ask the user to test when you genuinely cannot (e.g., visual UI checks, browser-specific behavior, production-only integrations).

## Architecture Overview

### Project Structure

```
src/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── (auth)/             # Login, register, verify, password reset
│   ├── upload/             # Batch invoice upload
│   ├── history/            # Invoice list + detail
│   ├── proveedores/        # Supplier master
│   ├── cuentas/            # Chart of accounts + associations
│   ├── carga-*/            # CSV/XLS import pages
│   ├── api-config/         # External ERP API config
│   └── api/                # Route handlers (auth, files, export)
├── actions/                # Server Actions ("use server") — primary mutation pattern
├── components/             # Feature components + ui/ (shadcn)
├── lib/                    # Domain logic, integrations, parsers
├── types/                  # Shared types + NextAuth augmentation
├── auth.ts                 # Auth.js / NextAuth v5 config
└── proxy.ts                # Route protection (Next.js 16 — no middleware.ts)
prisma/
├── schema.prisma           # Data model
├── migrations/             # SQL migrations
└── seed.ts
scripts/                    # Maintenance / dev scripts
public/                     # Static assets
```

### Tech Stack

- **Framework:** Next.js 16.2.6, React 19, TypeScript (strict)
- **Database:** PostgreSQL via Prisma 5 (`DATABASE_URL`)
- **Auth:** Auth.js / NextAuth v5 beta (Credentials + JWT, 7-day session)
- **Styling:** Tailwind CSS v4 (CSS-first in `src/app/globals.css`), shadcn/ui + Base UI
- **AI:** OpenAI (`gpt-4o-mini` default) for invoice extraction
- **Storage:** AWS S3 → Neon `stored_files` → local `.data/uploads/` (priority order)
- **Email:** Nodemailer SMTP for registration approval + password reset
- **Path alias:** `@/*` → `./src/*`

### App Router Patterns

- **Server Components** by default — pages are `async`, call `await auth()` for session
- **Server Actions** (`src/actions/`) for all mutations: upload, edit, import, ERP send, auth flows
- **API routes** only when needed: Auth.js protocol, binary file serving, CSV/XLSX export
- **`export const dynamic = "force-dynamic"`** on data-heavy pages
- Spanish UI copy and Spanish URL slugs (`/iniciar-sesion`, `/proveedores`, etc.)

## Authentication

**Config:** `src/auth.ts`
- Provider: Credentials (email + password, bcrypt)
- Session: JWT, 7-day max age
- Login requires `emailVerifiedAt` (admin-approved activation)
- Secret: `AUTH_SECRET` (or `NEXTAUTH_SECRET` / `BETTER_AUTH_SECRET` fallback)
- `trustHost: true`

**Route guard:** `src/proxy.ts` (Next.js 16 pattern — there is no `middleware.ts`)
- Auto-protects: `/upload`, `/history` → redirect to `/iniciar-sesion`
- Auth pages redirect away if logged in → `/upload`
- Matcher excludes: `api/auth`, `api/files`, static assets

**Server actions:** `src/actions/auth.ts` — register, verify, login, password reset, logout

**Rule:** Every query and mutation MUST filter by `session.user.id`. Never expose another user's data.

## Data Models

**Schema:** `prisma/schema.prisma` — PostgreSQL

| Model | Purpose |
|-------|---------|
| `User` | Auth identity; owns all tenant data |
| `Invoice` | Central entity — file metadata, OCR/AI extraction, amounts, fiscal fields, ERP upload status |
| `InvoiceFile` | Multi-part invoices (e.g. two photos of same invoice) |
| `StoredFile` | Binary blob in Postgres when S3 is not configured |
| `Supplier` | Per-user supplier master (`code`, `cuit`, `name`) |
| `SupplierAlias` | Learned name → supplier code mappings |
| `ChartAccount` | Imported chart of accounts |
| `SupplierChartAccountLink` | Supplier → account association |
| `TaxChartAccountSettings` | VAT, perception-IVA (PIV), perception-IIBB (PIB) and bonificación account links + "ignore bonificaciones" flag |
| `IntegrationConfig` | Per-user external ERP API URL + token |
| `CuitEmpresa` / `CuitSucursal` | CUIT → empresa/sucursal mappings |
| `Correction` | Audit trail of manual field edits on invoices |
| `AccountingAccount` | Legacy global expense categories (seeded, largely superseded) |

**Enum:** `InvoiceStatus` — `PROCESSING`, `READY`, `ERROR`, `CORRECTED`

**Prisma client:** singleton in `src/lib/db.ts`

## Invoice Processing Pipeline

Orchestrated in `src/actions/invoices.ts`:

```
Upload → Store file → Extract text/vision → OpenAI parse → Match supplier
       → Resolve chart account → Persist → Optional ERP POST
```

| Step | File | Details |
|------|------|---------|
| 1. Store | `src/lib/storage.ts` | S3 → Neon `stored_files` → local `.data/uploads/` |
| 2. PDF text | `src/lib/ocr.ts` → `src/lib/pdf-text.ts` | `pdf-parse` for embedded text |
| 3. PDF raster | `src/lib/pdf-raster.ts` | `pdf-to-img` + `@napi-rs/canvas` for scanned PDFs |
| 4. AI extract | `src/lib/ai.ts` | OpenAI text + vision, Zod structured parse |
| 5. Supplier match | `src/lib/supplier-match.ts` | CUIT + alias matching |
| 6. Chart account | `src/lib/chart-account-match.ts` | Account resolution |
| 7. ERP upload | `src/actions/integration-upload.ts` | POST accounting JSON with `X-Auth-Token` |

**Schemas:** `src/lib/schemas.ts` — Zod schemas for AI responses
**Retry:** `src/lib/openai-retry.ts` — rate-limit retry wrapper
**Serialization:** `src/lib/serialize-invoice.ts`, `src/lib/invoice-json.ts`

## Integrations

| Service | File | Env vars |
|---------|------|----------|
| OpenAI | `src/lib/ai.ts` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| AWS S3 | `src/lib/storage.ts` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` |
| SMTP | `src/lib/email.ts` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `REGISTRATION_NOTIFY_EMAIL` |
| External ERP | `src/lib/integration-auth.ts` | Per-user config at `/api-config` |
| PDF text | `src/lib/pdf-text.ts` | — |
| PDF raster | `src/lib/pdf-raster.ts` | — |

See `.env.example` for the full list.

## API Routes

Only 3 API routes exist — prefer Server Actions for new mutations.

| Route | File | Purpose |
|-------|------|---------|
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | Auth.js handlers |
| `/api/files/[...key]` | `src/app/api/files/[...key]/route.ts` | Serve files (auth + user-scoped key) |
| `/api/history/export` | `src/app/api/history/export/route.ts` | CSV/XLSX export |

## Server Actions

All in `src/actions/` with `"use server"`:

| File | Purpose |
|------|---------|
| `auth.ts` | Register, verify, login, password reset, logout |
| `invoices.ts` | Upload, edit, list, delete invoices |
| `suppliers.ts` | CRUD suppliers |
| `chart-accounts.ts` | CRUD chart accounts |
| `supplier-chart-accounts.ts` | Supplier–account links |
| `tax-chart-accounts.ts` | VAT/perception account links |
| `api-config.ts` | Save/load ERP integration config |
| `integration-upload.ts` | POST invoice JSON to external ERP |

## Key Patterns

### User-scoped queries
```typescript
const session = await auth();
if (!session?.user?.id) redirect("/iniciar-sesion");

const invoices = await prisma.invoice.findMany({
  where: { userId: session.user.id },
});
```

### Server Action pattern
```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function myAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "No autorizado" };
  // ... mutation scoped to session.user.id
}
```

### Component organization
- Feature components flat in `src/components/`
- shadcn/ui primitives in `src/components/ui/`
- Shell wrappers for related pages (`proveedores-shell.tsx`, `cuentas-shell.tsx`)
- Forms use React `useActionState` with server actions
- `cn()` utility in `src/lib/utils.ts` (clsx + tailwind-merge)

### PDF libraries on serverless
`next.config.ts` marks `pdf-parse`, `pdf-to-img`, `pdfjs-dist`, `@napi-rs/canvas` as `serverExternalPackages`. Do not import these in client components.

## Environment Variables

Full reference in `.env.example`. Critical vars:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | JWT signing secret |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL for file links |
| `OPENAI_API_KEY` | Yes (for AI) | Invoice extraction |
| `SMTP_*` | Yes (for auth) | Registration + password reset emails |
| `AWS_*` / `S3_BUCKET_NAME` | Optional | S3 file storage (production) |

## Deployment

- **App:** Vercel (serverless)
- **Database:** Neon PostgreSQL (use pooled URL on Vercel)
- **Files:** AWS S3 in production; Neon `stored_files` or local disk as fallback
- **Domain:** [agilescan.com.ar](https://agilescan.com.ar)
- **Migrations:** Run `prisma migrate deploy` in CI/CD or manually after merge
