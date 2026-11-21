# Project structure

```
sunpower-solar-erp/
├── backend/                     Node.js + Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma        data model (Prisma)
│   │   ├── migrations/          SQL migrations incl. triggers and views
│   │   └── seed/                seed script (one-command demo data)
│   ├── scripts/                 dev helpers (embedded DB, e2e check)
│   └── src/
│       ├── config/              environment config
│       ├── lib/                 prisma client, errors, zod helpers, utils
│       ├── middleware/          auth, validation, error handling
│       ├── realtime/            Socket.IO notifications
│       ├── docs/                OpenAPI / Swagger spec
│       └── modules/<feature>/   routes -> controller -> service -> repository (+ schema)
│           auth, users, enquiries            (done)
│           surveys, catalog, quotes, orders, invoices, inventory,
│           dispatch, jobs, tickets, reports, customers, subsidies   (planned)
├── frontend/                    React + Vite + TypeScript + Tailwind
│   └── src/ components, hooks, lib, pages, types
├── docs/                        ER diagram and project docs
└── docker-compose.yml           local PostgreSQL
```

Request flow: `route -> validate (zod) -> controller -> service (rules, transactions) -> repository (Prisma / SQL)`.
