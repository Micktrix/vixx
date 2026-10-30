# Vixx

Planlægning og timeregistrering for køreskoler. Læs [CLAUDE.md](CLAUDE.md) og [docs/BYGGEPLAN.md](docs/BYGGEPLAN.md) først.

## Kom i gang lokalt

Kræver Node 20+ og Docker Desktop (til lokal Supabase).

```bash
npm install
cp .env.example .env.local
npm run db:start   # starter Supabase lokalt og viser URL og nøgler
npm run dev        # http://localhost:3000
```

Supabase Studio (databasen i browseren): http://127.0.0.1:54323

## Scripts

| Script | Gør |
|---|---|
| `npm run dev` | Udviklingsserver |
| `npm run check` | ESLint + typecheck |
| `npm run build` | Produktionsbuild |
| `npm run db:start` / `db:stop` | Start/stop lokal Supabase |
| `npm run db:reset` | Kør alle migrationer forfra og indlæs `supabase/seed.sql` |
| `npm run db:new <navn>` | Ny migration i `supabase/migrations/` |

## Sider

- `/` – forside (bliver til login i trin 2)
- `/kontor` – kontordelen med sidemenu
- `/laerer` – lærerdelen med bundmenu
