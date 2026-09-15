# Modules

| Area | Domain | Application | HTTP |
|------|--------|-------------|------|
| Auth / users | `domain/user`, `domain/auth` | `application/auth`, `application/user` | `/api/v1/auth`, `/api/v1/users` |
| RBAC | `domain/rbac` | `application/rbac` | `/api/v1/roles`, `/api/v1/permissions` |
| Books | `domain/book` | `application/book` | `/api/v1/books` |
| Cart | `domain/cart` | `application/cart` | `/api/v1/cart` |
| Orders | `domain/order` | `application/order` | `/api/v1/orders` |
| Reviews | `domain/review` | `application/review` | `/api/v1/reviews` |
| Favorites | `domain/favorite` | `application/favorite` | `/api/v1/favorites` |
| Discounts | `domain/discount` | `application/discount` | `/api/v1/discounts` |
| Reports | `domain/report` | `application/report` | `/api/v1/reports` |
| Admin | — | `application/admin` | `/api/v1/admin` |

Cross-cutting infrastructure: logging, local storage, console notifications, Prisma UoW.
