# SunPower Solar ERP

Solar Installation Management System: takes a rooftop-solar customer from the first enquiry to the 20-year warranty
(enquiry, site survey, quote, order and payment, dispatch with serial numbers, installation sign-off, service tickets, profit reports).

## Stack (PERN + TypeScript)

- **Frontend:** React (Vite, TypeScript), Tailwind CSS, React Router, React Hook Form + Zod
- **Backend:** Node.js + Express (TypeScript), layered `routes -> controllers -> services -> repositories`, Zod validation,
  JWT + bcrypt auth, Helmet / CORS / rate limiting, centralized error handling, Socket.IO for real-time notifications
- **Database:** PostgreSQL (local) with Prisma for schema, migrations and types
- **Tooling:** ESLint + Prettier, tsx, Swagger (OpenAPI) docs, dotenv

No Firebase / Supabase / MongoDB Atlas and no static JSON in the final solution.

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the folder layout.
