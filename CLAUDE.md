# Vixx – planlægning og timeregistrering for køreskoler

Læs denne fil før hver opgave. Den er projektets "sandhed". Hvis noget i koden strider mod den, så spørg før du ændrer.

## Hvad vi bygger
Vixx er en webapp til køreskoler:
- **Kontor** (computer): planlægger lektioner, godkender lærernes registreringer, laver lønoverblik og eksport til Dataløn.
- **Lærer** (telefon): ser sit skema, registrerer kørte lektioner, søger ferie, melder "Kan arbejde".

Første kunde er én køreskole (pilot), men systemet bygges fra dag ét til **flere køreskoler** med adskilte data. Senere kommer en elevdel (booking, forløb, teori og prøver) på samme platform.

Reference for skærme og flow: `docs/prototype.html` (åbn i browser). Prototypen er en tegning, ikke kode der skal genbruges.

## Teknik
- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**.
- **Supabase**: Postgres, Auth, Row Level Security (RLS). Region: EU.
- **Vercel** til hosting (EU-region). Domæne: `vixx.dk`.
- **PWA**: appen kan lægges på telefonens hjemmeskærm. (Push kommer i en senere fase.)
- Ét kodebase til både kontor og lærer. Mobil-først for lærerdelen, desktop-først for kontordelen.

## Miljøer
| Miljø | Hvor | Database | Data |
|---|---|---|---|
| Udvikling | lokalt (`npm run dev`) | Supabase lokalt via CLI | kun testdata (seed) |
| Test | `test.vixx.dk` | eget Supabase-projekt | pilotens data |
| Drift | `app.vixx.dk` | eget Supabase-projekt | rigtige data |

- Databaseændringer laves **kun** som migrationer i `supabase/migrations/`. Ret aldrig direkte i test eller drift.
- Hemmeligheder ligger i `.env.local` / Vercel-miljøvariabler, aldrig i git.

## Sprog og stil
- **Al tekst i brugerfladen er på dansk.** Kort, venlig og konkret. Datoer som "Torsdag 29. oktober". Tid som "08:00–10:15". Beløb som "1.820 kr.".
- Kode, tabeller og variabelnavne på **engelsk**.
- Lys, rolig farvepalet (se prototypen): varm lys baggrund, hvide flader, én orange accentfarve (#DD7434), dæmpede statusfarver. Ingen navy, ingen mørk tilstand foreløbig.

## Multi-tenant og sikkerhed (vigtigst)
- Alle forretningstabeller har `school_id`. **RLS er slået til på alle tabeller**, og en bruger kan kun se data fra sin egen skole.
- Roller pr. skole: `admin` (superadmin for skolen), `office` (kontor), `instructor` (lærer). Platformens ejer (Michael) har en separat `platform_owner`-rolle.
- Rettigheder (foreløbigt):
  - `admin`: alt, inkl. ydelser og satser, kontorbrugere, oplåsning af lønperioder.
  - `office`: planlægge, godkende/afvise/rette registreringer, fravær, ferie, lokaler/køretøjer, undervisere (ikke priser).
  - `instructor`: egne data – skema, registreringer, ferieanmodning, "Kan arbejde", egne bookinger, egne kontakt- og pårørendeoplysninger.
  - `student` (elev): ligger i tabellen `students`, ikke i `school_members`, så eleven ikke rammer "medlemmer ser …"-reglerne. Eleven ser kun sig selv, sit hold, sin skole og forløbene, og lander i elevens app (`/elev`). Kontoret opretter hold og elever; lærerne kan se skolens elever.
- Skriv RLS-politikker og test dem. Ingen forretningslogik der kun er sikret i frontend.

## Login
- **Brugernavn = telefonnummer** (gemmes som E.164, fx `+4520456789`). Unikt pr. person.
- **Nu (test):** telefonnummer + kode. Første kode er personens eget telefonnummer (fx `20456789`), så telefonnummeret er både brugernavn og første kode. Ved første login skal man vælge egen kode (ikke telefonnummeret). Kontoret kan nulstille koden (til telefonnummeret igen) og logge læreren ud af alle enheder.
- **Senere:** engangskode på SMS. Byg login, så metoden kan skiftes uden at ændre brugere eller data (telefonnummeret er identiteten).
- Kontorbrugere har hver deres login, så det altid fremgår, hvem der har gjort hvad.

## Forretningsregler (skal overholdes)
**Lektioner og tid**
- En lektion er som standard 45 min (indstilling pr. skole).
- **Lektionsplan** pr. skole (indstilling): faste starttider med pauser, standard 08:00 08:45 | 10:00 10:45 | 12:00 12:45 | 13:45 14:30. Man kan kun planlægge/registrere fra planens starttider, og flere lektioner følger planen med pauserne (8 lektioner fra 08:00 slutter 15:15). Ud over planens sidste tid fortsætter lektionerne uden pause.
- Sluttiden gemmes på lektionen (`span_minutes`), så en senere ændring af planen ikke flytter gamle lektioner. Læreren er optaget hele blokken, også i pauserne.
- Ny planlægning foreslår første ledige starttid i planen; optagede tider kan ikke vælges.
- Ingen overlap: en lærer kan ikke have to lektioner, eller lektion og fravær, samtidig. Samme for lokaler og køretøjer.

**Planlagt vs. registreret**
- *Planlagt lektion* (`scheduled_lessons`): lagt ind af kontoret eller af læreren selv (frem i tiden). Viser at læreren er optaget. Tæller **ikke** i lønnen.
- *Registrering* (`registrations`): læreren melder en kørt lektion (fx via "Udført"). Kan kun laves for i dag eller tidligere.
- Kun **godkendte** registreringer tæller i lønnen.
- Registrering uden planlagt lektion markeres "uplanlagt". Afvigelse mellem planlagt og registreret antal markeres.

**Godkendelse**
- Status: `pending` (afventer), `approved` (godkendt), `rejected` (afvist med kommentar).
- Ved godkendelse/afvisning gemmes **hvem og hvornår**.
- Ved godkendelse **låses prisen** på registreringen (`locked_price`). Senere prisændringer rører den ikke.
- Afvist lektion kan rettes og sendes igen af læreren, eller rettes og godkendes direkte af kontoret (læreren får besked).

**Ydelser og satser**
- *Ydelse* = det der vælges ved planlægning/registrering (fx "Amu-teori", "C privat", "Aften Amu C/E"). En ydelse er kun **navn, sats og Dataløn-løndel**. Der er ingen kategorier eller typer (fjernet 11. nov. 2026 for at gøre det enkelt).
- *Sats* = beløbet pr. lektion. Den sidder direkte på ydelsen og har **gyldig-fra-dato** (historik). Flere ydelser må gerne have samme sats. Der findes ingen separate sats-grupper.
- En lærer kan have egen sats på en ydelse (override).
- Beregning: låst sats hvis godkendt → ellers lærerens egen sats → ellers ydelsens sats gældende på lektionens dato.
- En ydelse der er brugt kan kun **slås fra**, ikke slettes.
- Ydelser og satser vedligeholdes af skolen selv i systemet.

**Lønperiode og eksport**
- Lønperiode: den 21. til den 20. (indstilling pr. skole).
- En periode kan låses; derefter kan intet i den ændres. Kun `admin` kan låse op, og det logges.
- Dataløn-eksport: CSV med én linje pr. lærer pr. ydelse: medarbejdernr., navn, løndel (fra ydelsen), tekst, antal, sats, beløb. Endeligt format afklares ud fra skolens importfil ("fleksible løndele").
- Gæstelærere afregnes via faktura og er **ikke** med i Dataløn-eksporten.

**Tilgængelighed**
- Lærere har ingen kompetencer i systemet: alle aktive lærere kan planlægges/registrere alle aktive ydelser. Skolen holder selv styr på, hvem der kan hvad. (Når elevdelen kommer, kobles elever på en lærer, der passer til kørekortet.)
- Tilgængelighed: `fixed` (de fleste – tilgængelig alle dage) eller `on_request` ("Efter aftale"). Lærere på "Efter aftale" melder "Kan arbejde" på valgte datoer med tidsrum, og vises kun som ledige der.
- "Find ledig underviser": dato, tid, antal → alle lærere, ledige først.

**Fravær og ferie**
- Fravær (kontoret): årsag (Syg, Fri, Andet), start, antal timer, note. Blokerer tiden. Tæller aldrig i lønnen.
- Ferie: læreren anmoder, kontoret godkender/afviser. Godkendt ferie blokerer dagene og giver ingen påmindelser.

**Lokaler og køretøjer**
- Ressourcer pr. skole: lokaler og køretøjer (kun navn; ingen kategorier eller typer).
- En lektion kan få et lokale eller køretøj; optagede kan ikke vælges. Flyttes/slettes lektionen, følger bookingen med.
- Lærere kan booke ledige lokaler/køretøjer frit og kun rette/slette egne bookinger.

**Elever (i gang, se Fase 3 i BYGGEPLAN)**
- Lektioner og registreringer har et valgfrit fritekstfelt `student_name` og et nullable `student_id` til senere.
- *Forløb* (`courses`, `course_lessons`): pr. kørekortkategori, bygget og rettet af **admin** under Indstillinger → Forløb (alle på skolen kan se). En lektion har nummer, antal × 45 min., type (kørsel/teori), sted, indhold (ét punkt pr. linje), noter og kontrolstof – som lektionsplanen på papir.
- QR-kvittering (`lesson_signoffs`): læreren scanner elevens QR-kode og kvitterer (kørelærerens underskrift), eleven bekræfter (elevens underskrift). En kvittering kan aldrig slettes. Kørselslektioner registreres til lønnen i samme tryk; teorilektioner gør ikke.

**Log og privatliv**
- Alle ændringer skrives i en ændringslog (hvem, hvornår, hvad). Følsomme værdier skrives ikke i loggen.
- Backup af timer: hver nat sendes en CSV med registreringer (igangværende + forrige lønperiode, alle statusser, uden elevnavne/noter) til en backup-e-mail, som kun admin kan se og rette. Ændring giver besked til den gamle adresse.
- Gem **ikke** CPR eller bankoplysninger (løn udbetales via Dataløn til NemKonto).
- Storskærm/dashboard viser aldrig elevnavne.

## Arbejdsform
- Følg `docs/BYGGEPLAN.md`. Byg **ét trin ad gangen**, og stop efter hvert trin med en kort status: hvad er lavet, hvordan testes det, hvad mangler.
- Tilføj ikke funktioner fra senere faser uden at spørge.
- Hvert trin: migration + RLS + seed-data + skærm + tests af de vigtigste regler.
- Skriv korte, læsbare komponenter. Hellere enkelt og rigtigt end smart.
- Når en regel er uklar: spørg, gæt ikke.
