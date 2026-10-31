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
| `npm test` | Unit-tests (Vitest) |
| `npm run test:e2e` | Browsertests af login og roller (Playwright). Kræver lokal Supabase med seed. Første gang: `npx playwright install chromium` |

## Login

- Brugernavn er telefonnummeret. Internt logger vi ind med en afledt adresse (`4520456789@login.vixx.dk`), fordi Supabase kræver en SMS-udbyder til rigtig telefon-login. Alt om login-metoden ligger i `src/lib/auth/login-identity.ts`, så SMS-engangskode kan sættes ind senere uden at ændre brugere.
- Kontoret opretter brugere med en midlertidig kode. Ved første login skal man vælge sin egen (mindst 8 tegn).
- En person kan have flere roller på samme skole: Admin, Kontor og Lærer vælges som afkrydsning. Admin + Kontor er det samme som Admin. Med både kontor og lærer skifter man mellem delene med en knap.
- Kontoret håndterer lærere; kun admin giver adgang til kontoret og ændrer roller.
- Deaktiveret, eller gæst efter "aktiv til": kan ikke logge ind eller planlægges. Historik og løn bevares.
- "Log ud af alle enheder" sletter brugerens sessioner, og appen tjekker ved hver side, at sessionen stadig findes.
- `SUPABASE_SECRET_KEY` bruges kun på serveren (`src/lib/supabase/admin.ts`).

## Testdata

`supabase/seed.sql` opretter Testkøreskolen med opdigtede personer. Alle testbrugere har koden `Test1234!`.

| Telefon | Navn | Rolle |
|---|---|---|
| +45 20 00 00 01 | Anne Admin | admin og lærer |
| +45 20 00 00 02 | Ole Kontor | kontor |
| +45 20 00 00 11–19 | Lars Jensen m.fl. | lærere (18 = "Efter aftale", 19 = gæst) |

## Database

- Beløb gemmes i øre (heltal). Dato og tid er dansk lokaltid.
- Én person (telefonnummer) kan høre til flere skoler via `school_members`.
- Hver lektion husker sin lektionslængde, så ændringer på skolen ikke flytter gamle lektioner.
- Kategorier (B, C …) er fælles; typer (Kørsel, Rybners …) vedligeholdes pr. skole. Nye skoler får standardtyperne.
- Lærerrollen er `instructors.active`; rækken slettes aldrig, så historik bevares.
- Priser: `public.unit_price_ore(registrering)` giver låst pris → lærerens egen pris → ydelsens pris på lektionens dato (`service_price_on`). Samme regel i `src/lib/prices.ts` til visning.
- En ydelse kan dække flere kategorier (`service_categories`); prisen er én pr. ydelse, og lektionen gemmer kun ydelsen.
- En brugt ydelse kan få flere kategorier, men ikke miste nogen, skifte type eller slettes; en sats med ydelser kan ikke slettes. En ydelse har altid mindst én pris og én kategori.
- RLS er slået til på alle tabeller. Hjælpefunktioner ligger i skemaet `private`.
- Alle ændringer logges automatisk i `audit_log` uden følsomme værdier.

## Sider

- `/` – login
- `/kontor` – kontordelen med sidemenu
- `/kontor/undervisere` – undervisere og brugere; `/ny` opretter, `/<bruger-id>` er personens side
- `/kontor/ydelser` – satser, ydelser og priser (kun admin retter)
- `/kontor/indstillinger` – typer
- `/laerer` – lærerdelen med bundmenu; `/laerer/oplysninger` er lærerens egne oplysninger
