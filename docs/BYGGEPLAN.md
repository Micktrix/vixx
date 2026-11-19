# Byggeplan – Vixx

Tre faser. Fase 1 er det, der skal i pilot. Hvert trin afsluttes med en kort status og godkendes, før næste trin starter.

---

## Fase 1 – kernen (pilot)

### Trin 0 – Opsætning
- Next.js + TypeScript + Tailwind. ESLint + typecheck.
- Supabase CLI lokalt, mappen `supabase/migrations/`, seed-script med testdata (én skole, 2 kontorbrugere, 8–9 lærere, ydelser, satser, lokaler, køretøjer).
- GitHub-repo. Vercel-projekt koblet til repo. `test.vixx.dk` peger på Vercel.
- Grundlayout: kontor (sidebar) og lærer (bundmenu), farver og typografi som i prototypen.
- **Færdig når:** appen kører lokalt og på test.vixx.dk med en tom forside.

### Trin 1 – Datamodel og RLS
Tabeller (alle med `school_id`, `created_at`, `updated_at`):
- `schools` – navn, lektionslængde (min), lønperiode-startdag, indstillinger.
- `profiles` – bruger (auth-id), skole, rolle (`admin`/`office`/`instructor`), navn, telefon (E.164, unik), `must_change_password`.
- `instructors` – profil-id, medarbejdernr., gæst (ja/nej, firma, aktiv til), tilgængelighed (`fixed`/`on_request`), kontakt (e-mail, adresse, postnr., by), ansat fra, fødselsdato, kørelærergodkendelse udløber, pårørende (navn, relation, telefon).
- `services` (ydelser) – navn, Dataløn-løndel, aktiv. Satsen (kr. pr. lektion med gyldig-fra) i `service_prices`.
  (Ændret 11. nov. 2026: sats-grupper, kategorier og typer er fjernet overalt; satsen sidder på ydelsen.)
- `service_prices` – ydelse, gyldig fra, beløb.
- `instructor_prices` – lærer, ydelse, beløb (override).
- `scheduled_lessons` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, oprettet af (kontor/lærer).
- `registrations` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, status, kommentar, `decided_by`, `decided_at`, `locked_price`, rettet-af-kontor-info.
- `absences` – lærer, dato, start, timer, årsag, note.
- `holidays` – lærer, fra, til, note, status.
- `availability` – lærer, dato, start, slut ("Kan arbejde").
- `resources` – type (`room`/`vehicle`), navn, aktiv.
- `bookings` – ressource, dato, start, minutter, titel, lærer (null), lektion (null).
- `pay_periods` – start, slut, låst, låst af/hvornår.
- `messages` / `notifications` – til alle eller én lærer, læst.
- `audit_log` – hvem, hvornår, handling, objekt, kort tekst.
- RLS-politikker pr. rolle (se CLAUDE.md). Tests af at en lærer ikke kan se andre læreres data, og at skoler ikke kan se hinanden.
- **Færdig når:** migrationer kører rent, seed virker, RLS-tests er grønne.

### Trin 2 – Login og roller
- Login med telefonnummer + kode. Første login tvinger ny kode.
- Kontoret opretter lærere og kontorbrugere med telefonnummeret som første kode (ændret 11. nov. 2026), kan nulstille kode og logge ud af alle enheder.
- Rollebaseret adgang til kontor- og lærerdel.
- Login-metoden pakkes, så SMS-engangskode kan tilføjes senere.
- **Færdig når:** man kan logge ind som admin, kontor og lærer og kun se det, rollen må.

### Trin 3 – Undervisere
- Liste, opret (fast/gæst), stamdata, kompetencer, tilgængelighed, egne priser.
- Læreren kan rette egne kontakt- og pårørendeoplysninger.
- **Færdig når:** kontoret kan oprette en lærer, der kan logge ind.

### Trin 4 – Ydelser og satser
- Admin-side: satser (navn, løndel, aktiv) og ydelser (navn, sats, kategori, type, pris med gyldig-fra, aktiv).
- Brugt → kun slå fra. Prishistorik.
- **Færdig når:** prisændring fra en fremtidig dato ikke påvirker lektioner før datoen.

### Trin 5 – Kontorets kalender og planlægning
- Visninger: Dag (lærere i rækker, tidslinje), Uge (lærere × dage), Måned (navne pr. dag). Filter på lærer.
- Planlæg lektion: lærer, dato (fold-ud kalender), start (08:00, optagede tider grå), antal, ydelse (kun dem læreren kan), elev (valgfri), note.
- Ret og fjern planlagt lektion. Fravær (årsag, fra kl., timer).
- "Find ledig underviser".
- Ferie: godkend/afvis.
- **Færdig når:** overlap er umuligt, og alle ændringer logges.

### Trin 6 – Lærer-appen
- Kalender for lønperioden med status pr. dag, dagspanel.
- "Udført" på planlagt lektion → registrering. Tilføj lektion (ydelse, antal, start, elev, note) for i dag/tidligere.
- Planlæg egen lektion frem i tiden (blokerer tid; ret/fjern egne).
- Ferieanmodning, "Jeg kan arbejde" (kun for "Efter aftale"), beskeder, mine oplysninger, overblik (lektioner, timer, godkendt beløb).
- Installérbar som PWA.
- **Færdig når:** en lærer kan klare en hel uge kun fra telefonen.

### Trin 7 – Godkendelser
- Faner: Mangler godkendelse / Godkendt / Afvist. Filter på lærer. Kolonne med lærer.
- Godkend, godkend alle der matcher, ret, afvis med kommentar. Hvem og hvornår vises.
- Prisen låses ved godkendelse.
- **Færdig når:** godkendte beløb ikke ændrer sig ved senere prisændring.

### Trin 8 – Lønoverblik og Dataløn
- Periodevælger, lektioner pr. sats pr. lærer, beløb, afventer.
- Lås/lås op (kun admin). Eksport til CSV (format justeres efter skolens importfil). Gæster udelades.
- **Færdig når:** tallene for en testperiode stemmer med en manuel beregning.

### Trin 9 – Log, beskeder, påmindelser
- Ændringslog med søgning. Beskeder fra kontor til alle/én lærer.
- Påmindelse i appen om manglende registrering og ventende godkendelser.

### Trin 11 – Lokaler, køretøjer og storskærm
(Flyttet fra Fase 2 efter ønske, så det kan være med i piloten.)
- Kalendere for lokaler og køretøjer (dag/uge), booking i ledige tider. Ingen dobbeltbooking.
- Ved planlægning kan et køretøj eller lokale kobles på lektionen; bookingen følger lektionen.
- "Book" i lærer-appen: ledige lokaler/køretøjer, egne bookinger kan rettes/slettes.
- Storskærm: dagens overblik (lektioner, undervisere, fravær/ferie, afventer, bookinger). Aldrig elevnavne.
- Lokaler og køretøjer vedligeholdes under Indstillinger.
- **Færdig når:** et køretøj kan ikke dobbeltbookes, og det følger lektionen, når den flyttes.

### Trin 10 – Klar til pilot
- Test-miljø med pilotskolens rigtige lærere, ydelser og priser.
- Backup slået til, fejlovervågning, simpel driftsvejledning.
- Pilot: 2–3 lærere + kontoret, én lønperiode parallelt med Excel.

---

## Fase 2 – efter pilot
- Push-beskeder ved ændrede lektioner.
- SMS-engangskode som login.
- "Jeg er syg" fra appen, helligdage i kalenderen.
- Registrering uden net (synkroniseres senere), hvis piloten viser behov.

## Fase 3 – elever (startet 12. nov. 2026)
Idé: eleven har sin egen profil og ser sit forløb. Eleven viser en QR-kode, læreren scanner den i lærer-appen og
kvitterer for lektionen (kørelærerens underskrift), og eleven bekræfter i sin app (elevens underskrift). Det
erstatter papirets lektionsplan med dato og to underskrifter.

### Trin E1 – Forløb (Indstillinger → Forløb)
- Admin bygger selv forløb pr. kategori (B, C, D, CE …) og kan rette dem, når ministeriet ændrer noget.
- Lektion: nummer, længde (antal × 45 min.), type (kørsel/teori), sted (fx øvelsesstrækning), indhold (punkter
  som "7.1 Igangsætning og standsning v. kantsten"), noter og kontrolstof. Rækkefølge kan ændres.
- En lektion, der er kvitteret for, kan kun slås fra, ikke slettes. Kvitteringer gemmer lektionens nummer og titel.
- Kun admin retter; alle på skolen kan se.
- **Færdig når:** C-forløbet fra papiret kan ses og rettes, og kontoret ikke kan rette.

### Trin E2 – Elever og hold (Kontor → Elever)
- Hold med elever. Elev oprettes med telefonnummer (login som lærerne), forløb og ydelse (til lønnen).
- Kontoret ser hold og elever med fremskridt i forløbet på en overskuelig måde.
- Elevens app: forløbet med gennemførte og manglende lektioner.

### Trin E3 – QR-kvittering
- Eleven viser en QR-kode; læreren scanner, ser hvad eleven mangler, vælger lektionen og kvitterer.
- Kørselslektioner: samme tryk registrerer timen til lønnen (ydelse fra elevens forløb, tid fra planlagt lektion
  eller lektionsplanen; kan rettes eller fravælges). Teorilektioner går ikke til lønnen.
- Eleven bekræfter i sin app. En kvittering kan aldrig slettes; den står som "afventer elev", til eleven bekræfter.

### Trin E5 – Eleven anmoder om kørelektioner (aftalt 12. nov. 2026)
- Kontoret kobler eleven på én eller flere faste lærere og sætter fluebenet "Må selv anmode om kørelektioner"
  (pr. elev, uanset hold og forløb – typisk B-elever, men også fx en aftenelev, der vil køre i dagtimerne).
- Læreren åbner tider i lærer-appen (dato, starttid fra lektionsplanen, antal lektioner). En åben tid gør ikke
  læreren optaget; man kan ikke åbne en tid, hvor man er optaget.
- Eleven ser kun åbne tider hos sine egne lærere og anmoder. Én anmodning pr. åben tid.
- Læreren godkender eller afviser. Godkendt = planlagt lektion med elevens navn og ydelse (læreren er optaget).
  Afvist = tiden er åben igen.
- Eleven kan melde afbud på en booket lektion indtil en frist før (indstilling pr. skole, standard 24 timer).
  Tiden bliver åben igen. Efter fristen kun via kontoret.
- Elevens app får bundmenu: Kalender (bookede lektioner, anmodninger og åbne tider), Forløb, QR og Mere
  (oplysninger, kode, kalender-abonnement, kontakt til skolen og de faste lærere, log ud).
- Kalender-abonnement (iCal) pr. elev med hemmeligt link, som lærernes.
- Kontoret ser åbne tider og anmodninger.

### Trin E6 – Beskeder til elever
- Kontoret sender beskeder til alle elever, et hold eller én elev. Eleven ser dem i appen.

### Trin E7 – Prøver og tjekliste
- Dato for teori- og køreprøve pr. elev. Tjekliste før prøven (fx lægeerklæring, førstehjælp).

### Trin E4 – Push-beskeder
- Påmindelse dagen før en lektion og om lektioner, der ikke er bekræftet. Besked ved godkendt/afvist anmodning.
  Senere også beskeder til lærerne.

### Trin E8 – Modulplaner (Færdselsstyrelsen, krav fra 1. juli 2026)
- Modulplanen erstatter lektionsplanen. Forløb bygges som moduler: nummer, navn, minimum teori, minimum kørsel
  (evt. i mørke) og emner (afsnit). Forløbet har minimum i alt og minimum undervisningsdage (B: 30 + 24, 14 dage;
  D: 16 + 18, 12 dage; C/E: 13 + 18, 10 dage). Skabeloner ud fra Færdselsstyrelsens planer (B, C, C/E, D, D/E, A …).
- Læreren scanner og vælger teori eller kørsel; det tælles i elevens aktuelle modul (kørsel går stadig til lønnen).
- Læreren afslutter modulet i appen (dato og lærer gemmes; Vixx viser, om minimum er nået).
- Også: repetitionslektioner efter ikke bestået praktisk prøve, lærerskift midt i et modul, selvstudie,
  manuelt gear (kode 78, kun B), skolens oplysninger (navn, CVR, adresse, telefon).
- Print: Vixx udfylder Færdselsstyrelsens udfyldbare PDF ("digital"-versionen); den afsluttende kørelærer skriver
  under med kuglepen pr. modul. Ingen elevunderskrift i modulplanen.
- Underskrift (aftalt 18. nov. 2026): læreren tegner sin underskrift med fingeren én gang under "Oplysninger"
  (kan tegnes om). Når læreren scanner eleven, og modulets minimum er nået, viser Vixx "Modul X er klar til at
  blive afsluttet". Læreren sætter flueben ved erklæringen ("eleven har opnået de nødvendige kompetencer") og
  trykker "Afslut modul". Underskriften, dato, lærerens navn og detaljerne lægges så automatisk på modulplanen.
  Modulet afsluttes aldrig af sig selv uden lærerens flueben. Afslutningen gemmes med hvem og hvornår og kan
  ikke ændres eller slettes. Underskriften sættes ind i feltet "Afsluttende kørelærers underskrift" i den
  udfyldte PDF.
- Michael regner med, at det er tilladt. Anbefaling: få det bekræftet skriftligt af Færdselsstyrelsen ("må
  kørelæreren gemme sin elektroniske underskrift én gang, så den sættes på, når læreren afslutter et modul?")
  (erklæring til myndighed, straffelovens § 163).
- Den digitale PDF har også underskriftsfelter af typen digital signatur (/Sig). MitID-signering er en
  mulighed senere.
- Færdselsstyrelsens guide "Sådan udfylder du modulplanen digitalt" (læst 19. nov. 2026):
  - Køreskoler må integrere modulplanen i egne it-systemer, så længe den kan vises med styrelsens layout og
    logo. Der stilles ingen krav til særlige it-systemer.
  - Den digitale underskrift, guiden beskriver, er et digitalt ID (certifikat) i Adobe Acrobat Reader, ikke en
    tegnet underskrift. Guiden nævner ikke tegnede underskrifter i egne systemer, så det skal stadig bekræftes.
  - Hver ny underskrift gemmes som en ny version, og alle versioner arkiveres. Vixx gemmer derfor hver
    underskrevet udgave og kan aldrig overskrive eller slette en.
  - Datofelterne i PDF'en skal have formatet d/m/yy.
  - Delvis digital udfyldning er tilladt: fx stamdata digitalt og resten i hånden. Når man er gået over til
    papir, kan planen ikke længere udfyldes digitalt.
  - Ved lærerskift sendes den gemte version videre til kollegaen, så det er altid den seneste version, der gælder.
  - Eleven kan vise planen til køreprøven på telefonen eller som print. Eleven skal have den seneste version,
    så elevens app skal vise den.
  - Spørgsmål sendes til koereuddannelse@fstyr.dk med emnet "Digital modulplan".
- Michaels beslutning (19. nov. 2026): læreren må lave en digital underskrift i Vixx.
  - **Bygget 19. nov. 2026:** siden "Min underskrift" i lærer-appen (Beskeder → Min underskrift). Læreren
    tegner med fingeren og trykker "Gem og lås". "Lås op og tegn igen" bruges, hvis den skal laves om; den gamle
    gælder, til en ny er gemt.
  - Tabellen `instructor_signatures` gemmer kun stregdata. Kun læreren selv kan se og rette den, heller ikke
    admin og kontor. Ændringsloggen skriver ikke stregerne.
  - Når modulplanen er bygget, sætter Vixx underskriften på automatisk, hver gang læreren afslutter et modul.
    Vixx gemmer en kopi af underskriften på afslutningen, så en ny underskrift senere ikke ændrer gamle moduler.
  - Modulplanen (Færdselsstyrelsens PDF) lægges op pr. kørekortkategori (B, C, C/E, D …) under Indstillinger →
    Forløb. Vixx udfylder den for hver elev, og eleven og læreren kan altid vise den seneste udgave.
  - EU-moduler (aftalt 19. nov. 2026): en kategori kan have en ekstra modulplan til EU (fx C/E med EU). Når en
    elev oprettes eller sættes på et hold, vælger kontoret, om eleven også skal gennemføre EU-modulerne. I så fald
    får eleven begge planer. EU-modulerne afsluttes og underskrives på samme måde (lærerens gemte underskrift,
    dato, navn), og hver plan har sin egen PDF og sine egne versioner. Det endelige indhold venter på skolens
    EU/AMU-blanketter.
- Første plan, før Michaels beslutning: Vixx udfylder den officielle PDF (stamdata, moduler, datoer,
  lærernavne), og læreren skriver under med kuglepen eller med digitalt ID i Adobe. Den tegnede underskrift,
  som Vixx lægger på automatisk, bygges først, når Færdselsstyrelsen har bekræftet den skriftligt.

### Idéer (aftalt 14. nov. 2026, ikke prioriteret endnu)
- Tilmelding af nye elever fra skolens hjemmeside: eleven udfylder en formular, kontoret godkender, og eleven
  oprettes med login. Frivilligt afsnit "Hensyn" (ordblind, farveblind, nedsat hørelse, koncentrationsbesvær,
  andet + fritekst). Det er helbredsoplysninger: udtrykkeligt samtykke, kun kontor og elevens lærere kan se dem,
  aldrig i ændringsloggen, slettes automatisk efter afsluttet forløb, og eleven kan se og rette dem selv.
  Lærerne ser et mærke ("Hensyn: Ordblind") ved scanning og i skemaet.
- Materialer (vidensbank, aftalt 18. nov. 2026): "Mine materialer" er privat for hver lærer og kontorbruger.
  "Skolens materialer" er i mapper, som kun admin opretter, omdøber, flytter og lukker (fx B, C/E, Taxa,
  EU/AMU, med undermapper). Alle lærere og kontor kan lægge filer eller links i admins mapper og se og downloade
  alt dér. Man deler fra "Mine" ved at vælge mappen fra admins liste (mappe skal vælges; intet "diverse").
  Ligger det forkert, kan ejeren selv flytte det, og admin og kontor kan også flytte det. Man retter og sletter sit eget, og admin og
  kontor kan rydde op. En mappe med indhold kan kun lukkes, ikke slettes. Hvem og hvornår vises.
  Påmindelse om ophavsret ved upload. Filer i Supabase Storage med RLS pr. skole (gratis plan: 1 GB, 50 MB pr.
  fil, så video som links). Senere: deling med elever og kobling til modulplanens moduler.
- Quiz (aftalt 18. nov. 2026, "Kahoot-idéen", men vi bruger ikke navnet Kahoot):
  - Lærere og kontor laver quizzer med 2–4 svar, det rigtige svar, valgfrit billede (fx færdselstavle) og tid
    pr. spørgsmål. Quizzer gemmes som materialer: private, eller delt i admins mapper til genbrug.
  - Egen quiz-sektion på storskærmen: læreren starter den, og storskærmen viser QR-kode og kort kode,
    spørgsmål, nedtælling, svarfordeling og pointtavle. Live-opdatering via Supabase Realtime.
  - Eleverne svarer på telefonen. Gæster deltager uden login med et kaldenavn, og deres resultat gemmes kun
    samlet for quizzen. Elever med login vælger også et kaldenavn (Vixx husker det), og deres resultat gemmes
    på eleven og ses i elevens app og af læreren.
  - Storskærmen viser aldrig rigtige navne, kun kaldenavne. Læreren kan fjerne en deltager.
  - Bagefter ser læreren, hvilke spørgsmål holdet havde svært ved.
  - Senere: quiz som hjemmeopgave i eget tempo.
- Teori-fremmøde med én QR-kode i lokalet/på storskærmen; læreren godkender holdet med ét tryk.
- "Jeg er syg" fra lærer-appen med overblik over berørte lektioner og omfordeling.
- Lærerens interne noter pr. elev (ses af næste lærer ved scanning).
- Venteliste på afbud hos samme lærer.
- Advarsel om elever, der er gået i stå (og modulplanens afbrydelsesregler).

### Senere
- Teoriundervisning i systemet. Betaling og saldo pr. elev (venter, aftalt 12. nov. 2026).

---

## Åbne spørgsmål til skolen
- Kronebeløb pr. ydelse, og om de er ens for alle lærere.
- Fordeling af ydelser på satser (især Soldater, Rybners, Diverse) og tillæg for aften/mørke.
- Eksempel på Dataløn-importfil og skolens løndele.
- Navne på kontorbrugere og hvem der er admin.
- Gæstelærere og faktura. Motorcykler (kategori A). Køretøj til Rybners.
