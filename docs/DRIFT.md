# Drift af Vixx

Kort vejledning til den daglige drift af test.vixx.dk (pilot). Hold den opdateret, når noget ændres.

## Hvor kører hvad

| Del | Hvor | Bemærkning |
|---|---|---|
| App | Vercel, team `vixx2`, projekt `vixx`, region Frankfurt (fra1) | Bygges automatisk ved push til `main` |
| Database og login | Supabase-projekt `bdbbmnjczmccewlocubb` (Frankfurt) | Rør ikke projektet "Gard" |
| Kode | github.com/Micktrix/vixx (privat) | |
| Domæne | `test.vixx.dk` = CNAME → `cname.vercel-dns.com` hos Simply.com | Rør ikke `vixx.dk`, `www` og mail-posterne |

## Udrulning

1. **Databaseændringer først.** Nye migrationer ligger i `supabase/migrations/`.
   ```bash
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```
2. **Derefter koden:** `git push` til `main`. Vercel bygger og udgiver på 1–2 minutter.
3. Tjek at https://test.vixx.dk svarer, og at du kan logge ind.

Ret aldrig direkte i databasen online. Alle ændringer laves som migrationer og testes lokalt først (`npm run db:test`, `npm test`, `npm run test:e2e`).

## Miljøvariabler (Vercel → Settings → Environment Variables, kun Production)

| Navn | Værdi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bdbbmnjczmccewlocubb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key fra Supabase (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Secret key fra Supabase (`sb_secret_…`), markeret som følsom |

- Den hemmelige nøgle må aldrig i git, i chat eller i browseren.
- **Skift nøgle**, hvis den kan være lækket: Supabase → Project Settings → API Keys → opret ny secret key → indsæt i Vercel → byg igen (Deployments → Redeploy) → slet den gamle nøgle i Supabase.
- Efter ændring af en variabel skal appen bygges igen (Redeploy), før den virker.

## Backup

Supabase' gratis plan har **ingen automatisk backup**, og projektet sættes på pause efter en uge uden brug. Vælg en af:

- **Supabase Pro** (ca. 25 $/md.): daglig backup i 7 dage, ingen pause. Gendannelse: Supabase → Database → Backups → vælg dato → Restore. Slå samtidig "Leaked password protection" til under Authentication.
- **Gratis + natlig kopi**: en GitHub-handling tager hver nat en kopi (`supabase db dump`) og gemmer den privat i 30 dage. Kræver database-koden som hemmelighed i GitHub. Gendannelse sker ved at indlæse kopien med `psql`.

Uanset valg: tag en ekstra kopi før større ændringer, fx `npx supabase db dump --linked -f backup.sql` (filen må ikke i git).

### Backup af timer på e-mail

Hver nat kl. ca. 02–03 (Vercel Cron, `vercel.json` → `/api/backup`) sendes en CSV til skolens backup-adresse med alle registreringer i den igangværende og den forrige lønperiode (godkendte, afventende og afviste, uden elevnavne og noter). Adressen sættes af admin under Indstillinger → "Backup af timer". Ændres den, får den gamle adresse besked, og ændringen står i ændringsloggen.

- Mails sendes via **Resend** (EU) fra `backup@mail.vixx.dk`. DNS-posterne til `mail.vixx.dk` ligger hos Simply.com; `vixx.dk`'s egne mail-poster er ikke rørt.
- Miljøvariabler i Vercel (Production): `RESEND_API_KEY` (følsom) og `CRON_SECRET` (følsom). Uden `CRON_SECRET` afvises den natlige kørsel.
- Status: Indstillinger viser, hvornår der sidst blev sendt, eller hvorfor det fejlede. "Send backup nu" sender med det samme.
- Det er en nødkopi af timerne, ikke en backup af hele databasen.

## Fejl og overvågning

- **Appens fejl:** Vercel → projekt `vixx` → Logs. Filtrér på "Error". Brugeren ser en dansk fejlside med en reference; søg på den i loggen.
- **Database og login:** Supabase → Logs (Postgres, Auth).
- **Sikkerhedstjek:** `npx supabase db advisors --linked --type all`. Kendt og bevidst: `session_is_active` kører med forhøjede rettigheder, men svarer kun for brugerens egen session.

## Brugere

- Oprettes under Kontor → Indstillinger → Undervisere → "+ Opret bruger". Personen logger første gang ind med sit telefonnummer som kode og vælger så sin egen.
- **Glemt kode:** personens side → "Nulstil kode". Koden bliver telefonnummeret igen, og personen vælger en ny ved næste login.
- **Mistet telefon:** "Log ud af alle enheder", derefter "Nulstil kode".
- **Stopper:** "Deaktivér". Historik og løn bevares.
- **Admin låst ude:** en anden admin kan nulstille koden. Er der ingen, kan platformens ejer gøre det i Supabase → Authentication → Users.

## Løn

- Lønoverblik → vælg periode → tjek "afventer" er 0 → **Eksport til Dataløn (CSV)** → importér i Dataløn → **Lås periode**.
- Kun admin kan låse op. Det står i ændringsloggen.
- Eksportens kolonner ligger i `src/lib/payroll.ts` (`DATALON_COLUMNS`) og tilpasses skolens importfil.

## Lokal udvikling

Se `README.md`. Kort: `npm install`, `npm run db:start`, `npm run dev`. Testdata: `npm run db:reset`.
