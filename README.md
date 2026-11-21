# SunPower Solar ERP

A solar installation management system. It takes a rooftop-solar customer from the **first enquiry to the 20-year
warranty**: roof survey, quote, order and payment, dispatch with serial numbers, installation sign-off, after-sales
service tickets and profit reports. It also includes a customer-facing website.

> Stack: React 18 + TypeScript (Vite) · Node.js + Express (TypeScript) · PostgreSQL + Prisma. No Firebase, Supabase or
> hosted BaaS, and no static JSON: everything is stored in a real local PostgreSQL database.

---

## Contents

1. [What is in the box](#what-is-in-the-box)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Demo accounts](#demo-accounts)
5. [Project structure](#project-structure)
6. [Business flow and rules](#business-flow-and-rules)
7. [Roles and permissions](#roles-and-permissions)
8. [Database design](#database-design)
9. [API reference](#api-reference)
10. [Frontend](#frontend)
11. [Security](#security)
12. [Real-time notifications](#real-time-notifications)
13. [Configuration](#configuration)
14. [Scripts](#scripts)
15. [Testing](#testing)
16. [Troubleshooting](#troubleshooting)
17. [Known limitations and next steps](#known-limitations-and-next-steps)

---

## What is in the box

### Customer website (`/home`, no login)

| Section | What it does |
|---|---|
| Hero + quote form | Compact free-quote form (name, mobile, address, size, type). Creates a real enquiry for the sales team |
| How it works | Six-step journey from first call to warranty |
| Solutions | On-grid and off-grid packages with **live prices** from the database (cost prices are never exposed) |
| Savings calculator | Type a monthly bill, pick 1-5 kW; shows bill after solar, monthly and yearly saving, subsidy and payback |
| Subsidy | PM Surya Ghar assistance by system size and how the paperwork is handled |
| Warranty check | Two ways: **mobile number** (verified with a one-time code) shows every item the customer owns with days left, or a **serial number** shows one item. Neither returns personal details |
| FAQ and footer | Common questions, links, **Staff login** |

`/enquire` is a stand-alone enquiry page that can be shared on WhatsApp.

### Staff application (login required)

| Area | Pages |
|---|---|
| Overview | Dashboard with KPI cards, collections chart, attention list, sales pipeline, low stock, quick actions |
| Sales | Enquiries (list and board view), Site surveys, Quotes, Orders, Invoices and payments, Subsidy tracker, Customers |
| Operations | Inventory (stock, serial numbers, purchases), Dispatch, Installation jobs |
| After-sales | Service tickets, Warranty lookup |
| Management | Profit and reports (profitability, unfinished work, technician payouts, CSV export), Products and packages, Staff |

Highlights: order-tracking style progress on enquiries and orders, a **Ctrl+K quick search**, a collapsible sidebar,
role-based navigation, summary cards and filter chips on every list, and a layout that works on phones.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, hand-written CSS design system (Inter font, no UI library) |
| Backend | Node.js 18+, Express 4, TypeScript, Zod validation, JWT + bcrypt, Helmet, CORS, express-rate-limit, Multer (uploads), Socket.IO, Swagger UI |
| Database | PostgreSQL (Docker image: 16; the embedded dev server is newer), Prisma (schema and migrations), raw SQL through Prisma for joins and locking |
| Tooling | tsx, ESLint, Prettier, embedded-postgres (zero-install local database) |

Backend code is layered: `route -> validate (Zod) -> controller -> service (rules, transactions) -> repository (SQL)`.

---

## Quick start

**Prerequisites:** Node.js 18 or newer, and either a PostgreSQL server or nothing at all (an embedded PostgreSQL is
included for development).

Run each numbered step in its own terminal, starting from the repository root.

```powershell
# 1. Install dependencies (once)
cd backend; npm install
cd ../frontend; npm install
```

```powershell
# 2. Database. Pick ONE option.

# Option A: embedded PostgreSQL, nothing to install (port 5433, database "sunpower_ts"). Leave it running.
cd backend; npm run db:embedded

# Option B: Docker
docker compose up -d          # PostgreSQL on :5432, database "sunpower"
#   then set DATABASE_URL in backend/.env to postgres://postgres:postgres@localhost:5432/sunpower

# Option C: your own PostgreSQL, set DATABASE_URL in backend/.env
```

```powershell
# 3. Environment file (once). Edit DATABASE_URL and JWT_SECRET if needed.
cd backend; copy .env.example .env
```

```powershell
# 4. Create the tables, triggers, views and demo data (once)
cd backend; npm run db:setup
```

```powershell
# 5. API on http://localhost:4000 (Swagger at /api/docs)
cd backend; npm run dev
```

```powershell
# 6. Web app on http://localhost:5173
cd frontend; npm run dev
```

Open **http://localhost:5173**: signed-out visitors see the customer website, and **Staff login** leads to the ERP.

`npm run db:setup` refuses to run on a database that already has users, so it is safe to re-run. To start over, drop
the database and run it again.

---

## Demo accounts

Password for every account: `Sunpower@123`

| Role | Email | Sees |
|---|---|---|
| Admin | `admin@sunpower.test` | Everything, can manage staff |
| Sales | `sales@sunpower.test`, `sales2@sunpower.test` | Enquiries, quotes, orders, invoices, subsidies, customers |
| Technician | `tech1@`, `tech2@`, `tech3@` + `sunpower.test` | Surveys and installation jobs |
| Warehouse | `warehouse@sunpower.test` | Inventory, purchases, dispatch, products |
| Support | `support@sunpower.test` | Tickets, warranty lookup |
| Director | `director@sunpower.test` | Read-only everywhere, plus reports |

The login screen has one-click role buttons that fill the form.

Sample serial numbers for the warranty lookup: `HX-INV3K-12220` (in warranty), `SP-INV1K-004081` (in stock, warranty not started).

---

## Project structure

```
sunpower-solar-erp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          data model (28 tables, 22 enums)
│   │   ├── migrations/            SQL migrations, including triggers and views
│   │   └── seed/seed.ts           demo data: staff, catalogue, stock, pipeline, history
│   ├── scripts/
│   │   ├── dev-db.ts              embedded PostgreSQL for development
│   │   └── e2e.cjs                end-to-end check of the whole business flow (73 checks)
│   ├── uploads/                   installation photos (git-ignored)
│   └── src/
│       ├── app.ts, server.ts      Express app and HTTP + Socket.IO server
│       ├── config/env.ts          environment and business constants
│       ├── lib/                   prisma client, SQL helpers, errors, zod validators, utils
│       ├── middleware/            auth (JWT, roles), validation, error handling
│       ├── realtime/socket.ts     Socket.IO rooms and notifications
│       ├── docs/openapi.ts        Swagger spec
│       └── modules/<feature>/     <feature>.routes / controller / service / repository / schema
│           auth, users, enquiries, surveys, catalog, quotes, orders, invoices,
│           inventory, dispatch, jobs, tickets, subsidies, reports, customers, public
├── frontend/
│   ├── public/login-bg.jpg        login background photo
│   └── src/
│       ├── api.ts, auth.tsx       typed fetch client and auth context
│       ├── components/            Layout (sidebar, top bar, Ctrl+K), ui.tsx (forms, modals, hooks),
│       │                          kit.tsx (KPI cards, chips, tags, meters, tracker), icons.tsx
│       ├── pages/                 one file per screen (staff app + Home + Login + PublicEnquiry)
│       ├── styles.css             staff app theme      site.css   customer website theme
│       └── types/, validators.ts
├── docs/PROJECT_STRUCTURE.md
└── docker-compose.yml             optional PostgreSQL container
```

---

## Business flow and rules

```
Enquiry -> phone qualification -> site survey (approved) -> quote -> order + invoice
  -> advance payment confirms the order -> dispatch (scan serial numbers) -> delivery (warranty starts)
  -> installation sign-off (photos + customer signature) -> service tickets (free in warranty, billed after)
```

| Step | What happens |
|---|---|
| Enquiry | Arrives from the website, WhatsApp, a call or a walk-in. Auto-assigned to the least-loaded active salesperson |
| Qualify | Sales logs the call: shadow-free area, monthly bill, grid suitability. Outcome: qualified, contacted again, or not suitable |
| Survey | Sales books a technician. The technician submits roof direction, tilt, cable run and usable area. Sales approves or rejects |
| Quote | Created from a package (bill of materials copied automatically), GST added, valid 15 days. Send, reject or accept |
| Accept | Creates the customer, order, order items (with cost snapshot), invoice, and a subsidy file for on-grid orders that asked for one |
| Advance | The first payment that reaches the advance % confirms the order: a dispatch is created and the least-loaded technician is scheduled about 3 working days out |
| Dispatch | The warehouse scans each serial number onto the order. The truck cannot leave until every serial-tracked item is scanned. Bulk items are deducted from stock |
| Delivery | Marking delivered starts the warranty clock on every serial of that dispatch |
| Install | The technician uploads photos and records the finish time and installed size. The customer signs on screen |
| Support | A ticket is raised from the customer's **mobile number** (staff see everything the customer owns and pick the faulty item) or from a serial number. In warranty it is free. Out of warranty, an invoice for parts and labour is generated. A replacement serial swaps the faulty unit and starts a new warranty |

**Constants** (`backend/src/config/env.ts`): advance 30% (`ADVANCE_PERCENT`), GST 5% (`GST_PERCENT`), quote validity 15 days.
**Subsidy** (PM Surya Ghar): Rs 30,000 per kW up to 2 kW, capped at Rs 78,000 from 3 kW.

Rules the system refuses to break: no quote before an approved survey; a quote must match the requested on-grid or
off-grid type; discount cannot exceed the subtotal; an invoice cannot be over-paid; a job cannot be signed off before
delivery, without a photo, or with a finish time before the start; stock can never go negative; a serial number is
unique and tied to one customer.

---

## Roles and permissions

`admin` passes every role check. `director` is read-only everywhere and is the only role besides admin that opens management reports.

| Action | Sales | Technician | Warehouse | Support | Director |
|---|:-:|:-:|:-:|:-:|:-:|
| View enquiries, quotes, orders, invoices | ✓ | | orders | | ✓ |
| Create enquiry, qualify, assign, book survey | ✓ | | | | |
| Review survey, quote, record payment, cancel order, assign crew | ✓ | | | | |
| Submit survey measurements | | ✓ | | | |
| Installation jobs, photos, sign-off | view | ✓ | | | view |
| Products, stock, purchase orders, goods receipt | | | ✓ | | |
| Scan, dispatch, mark delivered | | deliver | ✓ | | |
| Create and resolve service tickets, warranty lookup | create | resolve | lookup | ✓ | view |
| Profit and reports, technician payouts | | | | | ✓ |
| Staff management, packages | admin only | | | | |

Technicians only see surveys and jobs assigned to them. Every write route is checked on the server.

---

## Database design

28 tables, 22 enums, 4 views and 8 triggers. Schema: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).
Migrations (including triggers and views): `backend/prisma/migrations/`.

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

**Triggers (rules enforced inside PostgreSQL, so even raw SQL cannot break them)**

| Trigger | Rule |
|---|---|
| `quotes_need_survey` | A quote can only be inserted for an enquiry whose survey is approved |
| `stock_non_negative` | A stock movement that would make stock negative is rejected |
| `dispatch_starts_warranty` | Delivery sets the warranty start and end on every serial of the dispatch |
| `units_status_guard` | A unit that has been delivered to a customer can never go back to stock |
| `*_updated` | Keeps `updated_at` current on users, customers, enquiries and subsidy files |

**Views (feed the dashboard and reports):** `v_stock` (on hand per product), `v_job_labour` (hours and labour cost),
`v_job_profitability` (revenue, materials, labour, profit, margin), `v_order_pipeline` (next step for every order).

**Design decisions**
- Stock is a **ledger**: on-hand is the sum of `stock_movements`, so every purchase, dispatch and service part is auditable.
- Each panel, inverter and battery is its own row (`inventory_units`) tied to a customer at dispatch, which makes warranty lookup instant.
- Money and stock changes use transactions with row locks (`FOR UPDATE`), so two people cannot over-pay an invoice or scan the same serial twice.
- An `activity_log` table records who did what, and is used for the timestamps on the progress trackers.

---

## API reference

Base URL `http://localhost:4000/api`. Authenticated routes expect `Authorization: Bearer <token>` from `POST /auth/login`.
Interactive docs for the core endpoints: **`/api/docs`** (Swagger UI). Errors return `{ "error": "...", "fields": { "name": "message" } }`.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/login`, `GET /auth/me` |
| Public (no login) | `POST /public/enquiries`, `GET /public/packages`, `GET /public/warranty/:serial`, `POST /public/warranty/otp`, `POST /public/warranty/verify` |
| Users | `GET /users`, `GET /users/all`, `POST /users`, `PATCH /users/:id` |
| Enquiries | `GET /enquiries`, `POST /enquiries`, `GET /enquiries/:id`, `POST /enquiries/:id/qualify`, `POST /enquiries/:id/assign` |
| Surveys | `GET /surveys`, `POST /surveys`, `POST /surveys/:id/complete`, `POST /surveys/:id/review` |
| Catalog | `GET /catalog/products`, `POST /catalog/products`, `PUT /catalog/products/:id`, `GET /catalog/packages`, `POST /catalog/packages`, `DELETE /catalog/packages/:id` |
| Quotes | `GET /quotes`, `GET /quotes/:id`, `POST /quotes`, `POST /quotes/:id/send`, `/reject`, `/accept` |
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/schedule` |
| Invoices | `GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/payments` |
| Inventory | `GET /inventory/stock`, `/units`, `/units/lookup/:serial`, `/suppliers`, `/purchases`, `POST /inventory/purchases`, `POST /inventory/purchases/:id/receive` |
| Dispatch | `GET /dispatches`, `GET /dispatches/:id`, `POST /dispatches/:id/scan`, `DELETE /dispatches/:id/scan/:serial`, `POST /dispatches/:id/dispatch`, `POST /dispatches/:id/deliver` |
| Jobs | `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/photos`, `DELETE /jobs/:id/photos/:photoId`, `POST /jobs/:id/complete` |
| Tickets | `GET /tickets`, `GET /tickets/:id`, `POST /tickets`, `POST /tickets/:id/assign`, `/lines`, `/resolve`, `/confirm`, `/reopen` |
| Subsidies | `GET /subsidies`, `PATCH /subsidies/:id` |
| Customers | `GET /customers`, `GET /customers/:id`, `GET /search?q=` |
| Reports | `GET /reports/dashboard`, `/profitability`, `/unfinished`, `/export/:type.csv`, `/payouts`, `POST /reports/payouts/generate`, `POST /reports/payouts/:id/pay` |

List endpoints accept `page`, `limit` (max 100) and filters such as `status` and `q`.

---

## Frontend

- **Routing:** `/` shows the customer website when signed out and the dashboard when signed in. Deep links without a session go to `/login`.
- **Theme:** staff app uses an indigo and navy SaaS theme (`styles.css`); the customer website uses navy and amber (`site.css`, scoped under `.site`).
- **Shared kit (`components/kit.tsx`):** `Kpi`, `Chips`, `Person`, `Tag`, `Meter`, `Stepper`, `Tracker`, plus `ago()` and `dueIn()` time helpers. New pages should compose these.
- **Data loading:** `useAsync` for fetches, `useAction` for submits (maps server field errors onto the form), `useForm` for form state. Loading uses shimmer skeletons.
- **Keyboard:** `Ctrl+K` / `Cmd+K` opens quick search; `Esc` closes dialogs.
- **Accessibility and motion:** focus rings, ARIA labels on icon buttons, and `prefers-reduced-motion` switches animations off.
- **Type check and build:** `npm run typecheck`, `npm run build` (type check, then Vite build).

---

## Security

- Passwords are hashed with bcrypt; sessions use signed JWTs (`JWT_EXPIRES_IN`, default 12 h).
- Role checks run on every write route on the server; the client menu only mirrors them.
- All input is validated with Zod; all SQL is parameterised.
- Helmet headers, CORS limited to `CORS_ORIGIN`, and rate limits: login 30 per 15 min, public enquiry form 20 per hour, public warranty check 30 per 15 min.
- Mobile-number warranty check: a 6-digit one-time code (valid 5 minutes, 5 tries, one use, stored only as a hash). The request answer is identical for known and unknown numbers so the form cannot reveal who is a customer. Limits: 6 code requests per hour and 20 verifications per 15 minutes per device, and 30 seconds between codes for one number.
- Installation photos: images only (JPG, PNG, WebP), 5 MB each, random server-side file names, and served only to signed-in users.
- The production build refuses to start with the default `JWT_SECRET`.

---

## Real-time notifications

The API runs a Socket.IO server. Browsers authenticate with their JWT and join a room per role and per user.
Currently the **new web or staff enquiry** event is pushed to the `sales` role (admin and director are always included).
Other event names (survey submitted, order confirmed, payment received, dispatch ready, job scheduled, and so on) are
defined in `backend/src/realtime/socket.ts` and ready to be wired in. The web app does not yet subscribe to the socket
and show live toasts (see next steps).

---

## Configuration

`backend/.env` (copy from `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/sunpower_ts` | PostgreSQL connection |
| `JWT_SECRET` | dev placeholder | Signing key. **Must** be set in production |
| `JWT_EXPIRES_IN` | `12h` | Session length |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed web origin(s), comma separated |
| `UPLOAD_DIR` | `backend/uploads` | Where installation photos are stored |
| `ADVANCE_PERCENT` | `30` | Percent of an order total that confirms it |
| `GST_PERCENT` | `5` | Tax added to quotes and service bills |
| `OTP_DEMO` | `true` outside production | Demo mode for the mobile-number warranty check: the one-time code is shown on screen instead of texted. In production it defaults to off and the check needs an SMS provider (see below) |

Dev database helper only: `PGPORT` (default `5433`) and `PGDATABASE` (default `sunpower_ts`).
The web dev server proxies `/api` and `/uploads` to `http://localhost:4000` (see `frontend/vite.config.ts`).

---

## Scripts

**backend**

| Command | Does |
|---|---|
| `npm run dev` | API with auto-reload (tsx watch) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | TypeScript check without emitting |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run db:embedded` | Start the embedded PostgreSQL (data in `backend/.pgdata`) |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Load demo data into an empty database |
| `npm run db:setup` | Migrate, then seed |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run e2e` | Run the end-to-end check against the running API |

**frontend**

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type check and production build into `dist/` |
| `npm run preview` | Serve the production build |

---

## Testing

`npm run e2e` (in `backend`, with the API and database running) walks the whole business flow over HTTP and prints
**73 checks**: login and roles, enquiry to qualification, survey, quote and order, payment confirming the order,
dispatch with serial scanning, delivery, installation sign-off, tickets in and out of warranty, director reports, and
the negative cases (duplicate serial, invalid vehicle number, wrong role, over-payment, and so on).

The script **creates its own records**, so run it on a development database. Re-seed to get a clean demo.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE :::4000` | Another API is already running. Stop it, or change `PORT` |
| Login or API calls fail with a database error | The database is not running. Start `npm run db:embedded` (or Docker) and check `DATABASE_URL` |
| `db:setup` says the database already has data | It only seeds an empty database. Drop the database and run it again |
| Web app shows "Cannot reach the server" | Start the API on port 4000; the dev server proxies to it |
| Photos do not show | Photos need a signed-in session; `uploads/` must be writable |
| `db:embedded` fails on first run | It downloads PostgreSQL binaries through `npm install`; run `npm install` in `backend` again, or use Docker |

---

## Known limitations and next steps

- Styling is a hand-written CSS design system, not Tailwind. Forms use a small in-house form helper, not React Hook Form.
- API responses are typed loosely on most frontend pages; shared response types would tighten this.
- The Socket.IO server only emits the new-enquiry event, and the web app does not yet show live notifications.
- The Swagger page documents the core endpoints; the table above lists every route.
- The mobile-number warranty check needs an SMS provider in production. `sendSms()` in `backend/src/modules/public/otp.service.ts` is the one place to plug MSG91, Twilio or similar in. Until then the check works in demo mode only (`OTP_DEMO=true`) and the serial-number check works everywhere. Codes are kept in memory, which suits a single API instance.
- Payments are recorded manually (cash, UPI, bank transfer, cheque, card). There is no payment-gateway integration.
- There are no unit tests; confidence comes from the 73-check end-to-end script and the database rules.
- Summary cards on list pages use the latest 100 records, which matters once a list grows beyond that.
