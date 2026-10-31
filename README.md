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
| `npm run test:e2e` | Browsertests (Playwright). Kræver lokal Supabase med seed og læser `.env.local` til opsætning. Første gang: `npx playwright install chromium` |

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
- Planlægning: databasen afviser overlap for en lærer (lektion/lektion, lektion/fravær, fravær/fravær, lektion i godkendt ferie) med en lås pr. lærer (`private.instructor_conflict`). Kun ydelser, læreren har kompetence til (type + kategori). Lektionen gemmer kategorien. Ferie kan ikke godkendes med lektioner i perioden. Samme regler i `src/lib/schedule.ts` til visning.
- Registreringer: en planlagt lektion kan kun registreres én gang; registreringer (ikke afviste) kan ikke overlappe; intet kan oprettes, rettes eller slettes i en låst lønperiode (gælder appens brugere).
- Godkendelse: databasen låser prisen (lærerens egen → ydelsens pris på datoen) og gemmer hvem/hvornår; klienten kan ikke sende en pris. En afvisning kræver kommentar. Kontorets rettelser markeres, og læreren får besked i appen.
- Lønperioder: kontor og admin kan låse; kun admin kan låse op (logges). Lønberegning og Dataløn-CSV i `src/lib/payroll.ts` (kolonner i `DATALON_COLUMNS`, tilpasses skolens importfil). Gæster er ikke med i eksporten.
- Ændringslog: `public.search_audit` søger i ændringer, i hvem der ændrede og på lærerens navn; `src/lib/audit.ts` oversætter til dansk.
- Lokaler og køretøjer: et køretøj dækker en eller flere kategorier (`resource_categories`), et lokale bruges til en eller flere typer (`resource_lesson_types`, fx Teori). Ved planlægning tilbydes lokaler til typer, et lokale bruges til, ellers køretøjer i lektionens kategori (`src/lib/resources.ts`). Ubrugte lokaler, køretøjer og typer kan slettes; brugte kun slås fra.
- Booking: et lokale/køretøj kan ikke dobbeltbookes (lås pr. ressource). En lektions booking følger lektionen (`private.follow_lesson_bookings`) og kan kun ændres af kontoret. Lærere booker kun til sig selv, fra i dag og frem.
- En brugt ydelse kan få flere kategorier, men ikke miste nogen, skifte type eller slettes; en sats med ydelser kan ikke slettes. En ydelse har altid mindst én pris og én kategori.
- RLS er slået til på alle tabeller. Hjælpefunktioner ligger i skemaet `private`.
- Alle ændringer logges automatisk i `audit_log` uden følsomme værdier.

## Sider

- `/` – login
- `/kontor` – kalender (dag/uge/måned, `?vis=&dato=&laerer=`)
- `/kontor/planlaeg`, `/kontor/fravaer`, `/kontor/find`, `/kontor/ferie` – planlæg/ret lektion, fravær, find ledig underviser, godkend ferie
- `/kontor/godkendelser` – godkend, godkend alle der matcher, afvis, ret (`/ret?id=`)
- `/kontor/loen` – lønoverblik pr. periode, lås/lås op; `/kontor/loen/eksport?periode=` henter Dataløn-CSV
- `/kontor/beskeder` – beskeder til alle/én lærer med læst-status; `/kontor/log` – ændringslog med søgning
- `/kontor/lokaler`, `/kontor/koeretoejer`, `/kontor/booking` – kalendere og booking; `/laerer/book` – lærerens booking
- `/storskaerm` – dagens overblik til en skærm på kontoret (opdaterer sig selv hvert minut, ingen elevnavne)
- Påmindelser: tal i kontorets menu (godkendelser, ferie), "Send påmindelse" under Godkendelser, og i lærer-appen "Du mangler at registrere" og afviste lektioner
- `/kontor/undervisere` – undervisere og brugere; `/ny` opretter, `/<bruger-id>` er personens side
- `/kontor/ydelser` – satser, ydelser og priser (kun admin retter)
- `/kontor/indstillinger` – typer
- `/laerer` – lærerens kalender for lønperioden med dagspanel ("Udført", tilføj, planlæg egen lektion)
- `/laerer/registrer`, `/laerer/planlaeg`, `/laerer/kan-arbejde`, `/laerer/ferie`, `/laerer/overblik`, `/laerer/beskeder`, `/laerer/oplysninger`
- Appen kan lægges på hjemmeskærmen (PWA): `src/app/manifest.ts`, ikoner i `src/app/app-icon/`
