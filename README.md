# SunPower Solar ERP

Solar Installation Management System: takes a rooftop-solar customer from the first enquiry to the 20-year warranty
(enquiry, site survey, quote, order and payment, dispatch with serial numbers, installation sign-off, service tickets, profit reports).

## Stack (PERN + TypeScript)

- **Frontend:** React 18 + TypeScript (Vite), React Router, hand-written CSS design system (SaaS theme)
- **Backend:** Node.js + Express (TypeScript), layered `routes -> controllers -> services -> repositories`, Zod validation,
  JWT + bcrypt auth, Helmet / CORS / rate limiting, centralized error handling, Socket.IO for real-time notifications
- **Database:** PostgreSQL (local) with Prisma for schema, migrations and types
- **Tooling:** ESLint + Prettier, tsx, Swagger (OpenAPI) docs, dotenv

No Firebase / Supabase / MongoDB Atlas and no static JSON in the final solution.

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the folder layout.

## Run it locally

Three terminals, from the repository root.

```powershell
# 1. Database (embedded PostgreSQL on :5433), or point DATABASE_URL at your own Postgres
cd backend; npm install; npm run db:embedded

# 2. API on :4000 (docs at /api/docs). First time only: npm run db:setup  (migrate + demo seed)
cd backend; npm run dev

# 3. Web app on :5173
cd frontend; npm install; npm run dev
```

Demo logins (password `Sunpower@123`): `admin@`, `sales@`, `tech1@`, `warehouse@`, `support@`, `director@` followed by `sunpower.test`.

`npm run e2e` in `backend` walks the whole business flow against a running API (73 checks).

## Business flow

```
Enquiry -> phone qualification -> site survey (approved) -> quote -> order + invoice
  -> advance payment confirms order -> dispatch (scan serial numbers) -> delivery (warranty starts)
  -> installation sign-off (photos + customer signature) -> service tickets (free in warranty, billed after)
```

Database triggers enforce the rules that must never be broken (no quote without an approved survey, no negative stock,
warranty clock starts on delivery); views power the profitability and unfinished-order reports.

## Database design

```mermaid
erDiagram
  USERS ||--o{ ENQUIRIES : "assigned to"
  ENQUIRIES ||--o{ SURVEYS : has
  USERS ||--o{ SURVEYS : "technician"
  ENQUIRIES ||--o{ QUOTES : has
  PACKAGES ||--o{ QUOTES : "template for"
  PACKAGES ||--o{ PACKAGE_ITEMS : "bill of materials"
  PRODUCTS ||--o{ PACKAGE_ITEMS : in
  QUOTES ||--o{ QUOTE_ITEMS : has
  PRODUCTS ||--o{ QUOTE_ITEMS : priced
  QUOTES ||--o| ORDERS : "accepted as"
  CUSTOMERS ||--o{ ORDERS : places
  ORDERS ||--o{ ORDER_ITEMS : has
  ORDERS ||--o{ INVOICES : billed
  INVOICES ||--o{ INVOICE_ITEMS : has
  INVOICES ||--o{ PAYMENTS : "paid by"
  ORDERS ||--o| DISPATCHES : shipped
  DISPATCHES ||--o{ INVENTORY_UNITS : "carries serials"
  PRODUCTS ||--o{ INVENTORY_UNITS : "serial tracked"
  PRODUCTS ||--o{ STOCK_MOVEMENTS : ledger
  SUPPLIERS ||--o{ PURCHASE_ORDERS : supplies
  PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_ITEMS : has
  PURCHASE_ORDERS ||--o{ INVENTORY_UNITS : received
  ORDERS ||--o| INSTALLATION_JOBS : installed
  INSTALLATION_JOBS ||--o{ JOB_CREW : staffed
  USERS ||--o{ JOB_CREW : works
  INSTALLATION_JOBS ||--o{ JOB_PHOTOS : documents
  ORDERS ||--o| SUBSIDY_APPLICATIONS : "may have"
  CUSTOMERS ||--o{ TICKETS : raises
  INVENTORY_UNITS ||--o{ TICKETS : "faulty unit"
  TICKETS ||--o{ TICKET_LINES : "parts and labour"
  TICKETS ||--o| INVOICES : "billed when out of warranty"
  USERS ||--o{ TECHNICIAN_PAYOUTS : paid
```

The full schema lives in [backend/prisma/schema.prisma](backend/prisma/schema.prisma) and the SQL migrations
(including triggers and views) in `backend/prisma/migrations`.
