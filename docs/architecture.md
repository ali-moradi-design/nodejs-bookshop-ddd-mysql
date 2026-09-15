# Architecture

Layered / DDD-inspired structure:

| Layer | Path | Responsibility |
|-------|------|----------------|
| **Domain** | `src/domain/` | Entities, repository ports, pure rules, value objects, DomainError, domain events |
| **Application** | `src/application/` | Use-cases / services, DTOs, application ports (e.g. UnitOfWork) |
| **Infrastructure** | `src/infrastructure/` | Prisma schema/repos, JWT/bcrypt, local-disk storage, console notifier, structured logger, composition root, Prisma `$transaction` UoW |
| **Interfaces** | `src/interfaces/http/` | Express controllers, routes, validators, presenters, OpenAPI, middleware |
| **Shared** | `src/shared/` | AppError, Domain→HTTP mapping, asyncHandler, pagination |

**Rule:** Domain must not import infrastructure, interfaces, Express, or Prisma (enforced via ESLint).

## Request flow

```
HTTP → controllers / validators
  → application services / use-cases
  → domain ports (repositories, UoW)
  → infrastructure adapters (Prisma, storage, …)
```

## Composition root

`src/infrastructure/composition/`:

- `repos.ts` — Prisma repository instances
- `infra.ts` — token/password/storage/notifier/UoW
- `services.ts` — application services wired to ports
- `index.ts` — public exports

## Persistence

- Provider: **MySQL** via Prisma (`prisma/schema.prisma`)
- IDs: `cuid()` strings
- Soft-delete: `deletedAt` where applicable
- Book `categories`: JSON array (MySQL has no native `String[]`)
- Transactions: Prisma `$transaction` + AsyncLocalStorage client (`getPrisma()`)

## Seed

`src/scripts/seed.ts` remains the CLI entry for permissions, roles, admin, 40 books, discounts.
