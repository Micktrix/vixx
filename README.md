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
| `npm run db:test` | RLS- og regeltests (pgTAP) i `supabase/tests/` |

## Testdata

`supabase/seed.sql` opretter Testkøreskolen med opdigtede personer. Alle testbrugere har koden `Test1234!`.

| Telefon | Navn | Rolle |
|---|---|---|
| +45 20 00 00 01 | Anne Admin | admin |
| +45 20 00 00 02 | Ole Kontor | kontor |
| +45 20 00 00 11–19 | Lars Jensen m.fl. | lærere (18 = "Efter aftale", 19 = gæst) |

## Database

- Beløb gemmes i øre (heltal). Dato og tid er dansk lokaltid.
- Én person (telefonnummer) kan høre til flere skoler via `school_members`.
- Hver lektion husker sin lektionslængde, så ændringer på skolen ikke flytter gamle lektioner.
- Kategorier (B, C …) er fælles; typer (Kørsel, Rybners …) vedligeholdes pr. skole.
- RLS er slået til på alle tabeller. Hjælpefunktioner ligger i skemaet `private`.
- Alle ændringer logges automatisk i `audit_log` uden følsomme værdier.

## Sider

- `/` – forside (bliver til login i trin 2)
- `/kontor` – kontordelen med sidemenu
- `/laerer` – lærerdelen med bundmenu
