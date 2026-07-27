# Docker

`docker-compose.yml` runs the full RentOS stack: PostgreSQL, Redis, the API
(NestJS), and the web app (Next.js). Dockerfiles for each app live next to
their source at [`apps/api/Dockerfile`](../apps/api/Dockerfile) and
[`apps/web/Dockerfile`](../apps/web/Dockerfile) — both use the repository
root as their build context since this is a pnpm workspace.

## Usage

From the repository root, with a `.env` file present (copy
[`.env.example`](../.env.example)):

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

This starts:

| Service    | Port (default) |
| ---------- | -------------- |
| `postgres` | 5432           |
| `redis`    | 6379           |
| `api`      | 4000           |
| `web`      | 3000           |

To start only the datastores (useful for local development against `pnpm dev`):

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres redis
```
