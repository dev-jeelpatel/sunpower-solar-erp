# Project structure

```
sunpower-solar-erp/
├── backend/                     Node.js + Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma        data model (28 tables, 22 enums)
│   │   ├── migrations/          SQL migrations incl. triggers and views
│   │   └── seed/seed.ts         one-command demo data
│   ├── scripts/                 dev-db.ts (embedded PostgreSQL), e2e.cjs (73-check flow test)
│   ├── uploads/                 installation photos (git-ignored)
│   └── src/
│       ├── app.ts, server.ts    Express app, HTTP + Socket.IO server
│       ├── config/              environment config and business constants
│       ├── lib/                 prisma client, SQL helpers, errors, zod helpers, utils
│       ├── middleware/          auth (JWT + roles), validation, error handling
│       ├── realtime/            Socket.IO notifications
│       ├── docs/                OpenAPI / Swagger spec
│       └── modules/<feature>/   routes -> controller -> service -> repository (+ schema)
│           auth, users, enquiries, surveys, catalog, quotes, orders, invoices,
│           inventory, dispatch, jobs, tickets, subsidies, reports, customers, public
├── frontend/                    React 18 + Vite + TypeScript
│   ├── public/                  static assets (login background)
│   └── src/
│       ├── api.ts, auth.tsx     typed API client, auth context
│       ├── components/          Layout, ui (forms, modals, hooks), kit (KPI cards, chips,
│       │                        tags, meters, tracker), icons, EnquiryForm, SignaturePad
│       ├── pages/               one file per screen
│       ├── styles.css           staff app theme
│       ├── site.css             customer website theme
│       └── types/, validators.ts
├── docs/                        project docs
├── README.md                    setup, features, API, database design
└── docker-compose.yml           optional local PostgreSQL
```

Request flow: `route -> validate (zod) -> controller -> service (rules, transactions) -> repository (SQL)`.

Adding a backend feature: create `backend/src/modules/<name>/` with `<name>.schema.ts`, `.repository.ts`,
`.service.ts`, `.controller.ts` and `.routes.ts`, then mount the router in `backend/src/app.ts`.

Adding a page: create `frontend/src/pages/<Name>.tsx`, compose it from `components/kit.tsx`
(`KpiRow`, `Chips`, `Person`, `Tag`, `Meter`), register the route in `App.tsx` and the menu entry in `components/Layout.tsx`.
