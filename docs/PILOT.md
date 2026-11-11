# Pilot

Mål: 2–3 lærere og kontoret bruger Vixx i én hel lønperiode, parallelt med Excel. Til sidst skal lønnen i Vixx stemme med Excel.

## Før piloten (i denne rækkefølge)

- [ ] **Backup besluttet** (Supabase Pro eller natlig kopi), se `DRIFT.md`.
- [ ] **Skolen:** Indstillinger → Generelt → navn, lektionslængde og lønperiodens startdag.
- [ ] **Ydelser:** Ydelser og satser → "+ Ny ydelse" med navn, **Dataløn-løndel** og **sats pr. lektion**. Sæt "Gælder fra" til periodens start.
- [ ] **Lokaler og køretøjer:** Indstillinger → Generelt. Kun navn.
- [ ] **Kontorbrugere:** Undervisere → "+ Opret bruger" med rollen Kontor eller Admin.
- [ ] **Pilotlærere:** "+ Opret bruger" med rollen Lærer. Udfyld **medarbejdernr.** (bruges i Dataløn).
- [ ] **Egne priser**, hvis en lærer har en anden pris end standard (lærerens side → Priser pr. ydelse).
- [ ] **Første login:** hver lærer logger ind på telefonen, vælger egen kode og lægger appen på hjemmeskærmen (iPhone: Del → Føj til hjemmeskærm; Android: Installér app).
- [ ] **Prøverunde:** planlæg en lektion, læreren trykker "Udført", kontoret godkender, og tjek lønoverblikket.
- [ ] **Storskærm** (valgfri): åbn test.vixx.dk/storskaerm i fuld skærm på kontorets skærm.

## Under piloten

**Lærerne, hver dag:**
- Tryk "Udført" på kørte lektioner, eller "+ Tilføj lektioner" for uplanlagte.
- Ret og send igen, hvis kontoret afviser.
- Søg ferie og meld "Jeg kan arbejde" i appen.

**Kontoret, løbende:**
- Planlæg i kalenderen, og kobl bil eller lokale på.
- Godkend under Godkendelser. Brug "Godkend alle der matcher", og ret eller afvis resten.
- Hold øje med tallene i menuen (godkendelser, ferie) og "Mangler registrering". Brug "Send påmindelse".

**Fortsæt med Excel som i dag.** Skriv afvigelser og ønsker ned med det samme, med dato og eksempel.

## Ved periodens slutning

1. Alt er godkendt (Godkendelser → "Mangler godkendelse" er tom).
2. Lønoverblik → sammenlign pr. lærer og pr. ydelse med Excel: antal lektioner og beløb.
3. Hent Dataløn-eksporten og sammenlign med det, der normalt indtastes. Tilpas kolonnerne til skolens importfil.
4. Notér alle forskelle og årsagen (fejl i Vixx, fejl i Excel, manglende registrering, anden regel).
5. Lås perioden, når tallene stemmer.

## Efter piloten

- Gennemgå noter og ønsker.
- Beslut om Vixx kan erstatte Excel, og hvornår resten af lærerne kommer med.
- Driftsmiljø på app.vixx.dk med egen database (som i CLAUDE.md), før alle lærere tages i brug.
