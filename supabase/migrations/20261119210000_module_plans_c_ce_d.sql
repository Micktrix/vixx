-- Trin E8, del 2: skabeloner for modulplanerne C, C/E og D (Færdselsstyrelsen, version 1.1 april 2026).
-- Afløser create_module_course fra del 1 (B er uændret). Minimum og emner er skrevet af fra PDF'erne:
--   C:   1: 8+5 · 2: 7+5 (1 i mørke) · 3: 1+8   = 16 + 18, 12 dage
--   C/E: 1: 7+5 · 2: 5+5             · 3: 1+8   = 13 + 18, 10 dage
--   D:   1: 8+5 · 2: 7+5 (1 i mørke) · 3: 1+8   = 16 + 18, 12 dage
-- C, C/E og D har næsten samme emner; forskellene er afsnit 1 (påhængskøretøj i C/E) og 7.19 (mørke, ikke i C/E).

create or replace function public.create_module_course(p_school_id uuid, p_template text, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_course uuid;
  v_category text;
  v_days int;
  -- Fælles tekster for C, C/E og D.
  v_intro text := E'Afsnit 0 – Indledning*\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.1 Køreundervisning mv.*';
  v_m1_rest text := E'Afsnit 2 – Indledende øvelser på vej\nAfsnit 3 – Køretøjers manøvreegenskaber\nAfsnit 4 – Trafikantadfærd\nAfsnit 5 – Vejforhold\nAfsnit 6 – Grundregler for færdsel\nAfsnit 7 (uddrag) – Udvidede øvelser på vej\n7.1 Igangsætning og standsning ved kørebanekant\n7.2 Placering under ligeudkørsel\n7.3 Hastighed under ligeudkørsel\n7.4 Vognbaneskift og sammenfletning\n7.5 Vending og baglænskørsel\n7.6 Kørsel forbi holdende køretøjer, gående mv.\n7.7 Møde\n7.8 Kørsel foran eller efter andre\n7.11 Fremkørsel mod kryds (mindre trafikerede veje)\n7.12 Ligeudkørsel i kryds (mindre trafikerede veje)\n7.13 Højresving i kryds (mindre trafikerede veje)\n7.14 Venstresving i kryds (mindre trafikerede veje)\n7.15 Kørsel i rundkørsel (mindre trafikerede veje)';
  v_m1_note text := '* Afsnit 0 (Indledning) og 10.1.1 (Køreundervisning mv.) skal gennemføres før øvrige emner i modul 1.';
  v_m2_start text := E'Afsnit 7 (uddrag) – Udvidede øvelser på vej\n7.1 Igangsætning og standsning ved kørebanekant*\n7.2 Placering under ligeudkørsel*\n7.3 Hastighed under ligeudkørsel*\n7.4 Vognbaneskift og sammenfletning*\n7.6 Kørsel forbi holdende køretøjer, gående mv.*\n7.7 Møde*\n7.8 Kørsel foran eller efter andre*\n7.11 Fremkørsel mod kryds*\n7.12 Ligeudkørsel i kryds*\n7.13 Højresving i kryds*\n7.14 Venstresving i kryds*\n7.15 Kørsel i rundkørsel*\n7.9 Overhaling\n7.10 Kørsel i trafiksanerede områder\n7.16 Kørsel på motorvej\n7.17 Kørsel ved siden af andre\n7.18 Standsning og parkering';
  v_m2_dark text := E'\n7.19 Kørsel i mørke og i lygtetændingstiden i øvrigt';
  v_m2_end text := E'\n7.20 Kørsel i tunnel\n7.21 Kørsel ved letbane\nAfsnit 8 – Særlige risikoforhold i trafikken\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.2 Indstilling til køreprøve\n10.2 Køreprøvens gennemførelse\n10.3 Lovbestemmelser om kørekort';
  v_m2_note text := '* De praktiske øvelser i de markerede underafsnit skal gennemføres på mere udfordrende veje og i tæt trafik.';
  v_m3 text := E'Afsnit 7 – Udvidede øvelser på vej\nAfsnit 9 – Manøvrer på køreteknisk anlæg*';
  v_m3_note text := '* Øvelserne på køreteknisk anlæg skal gennemføres i overensstemmelse med undervisningsplanens afsnitsopdeling.';
begin
  select t.category, t.days into v_category, v_days
  from (values ('B-1.1', 'B', 14), ('C-1.1', 'C', 12), ('CE-1.1', 'CE', 10), ('D-1.1', 'D', 12)) t (template, category, days)
  where t.template = p_template;
  if v_category is null then
    raise exception 'Ukendt modulplan: %', p_template using errcode = '22023';
  end if;

  insert into public.courses (school_id, category_code, name, plan_kind, plan_version, min_days)
  values (p_school_id, v_category, p_name, 'modules', '1.1', v_days)
  returning id into v_course;

  if p_template = 'B-1.1' then
    insert into public.course_modules (school_id, course_id, number, name, min_theory, min_driving, min_dark, topics, notes)
    values
      (p_school_id, v_course, 1, 'Grundlæggende trafikforståelse', 7, 0, 0,
       E'Afsnit 0 – Indledning*\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.1 Køreundervisning mv.*\nAfsnit 3 – Køretøjers manøvreegenskaber\nAfsnit 4 – Trafikantadfærd\nAfsnit 5 (uddrag) – Vejforhold\n5.1 Vejenes sikkerhedsmæssige udformning\nAfsnit 6 (uddrag) – Grundregler for færdsel\n6.1 Anvisninger for færdslen\n6.2.1 Grundregler for færdslen\n6.2.2 Fare, ulempe og unødig ulempe\n6.2.9 Færdselsulykke\n6.2.10 Forsikringspligt\n6.2.11 Overladelse af køretøj til andre',
       v_m1_note),
      (p_school_id, v_course, 2, 'Forberedende teori- og kørselsmodul', 5, 3, 0,
       E'Afsnit 1 – Køretøjets indretning, udstyr, betjening og dokumenter\nAfsnit 2 – Manøvrer på lukket øvelsesplads\nAfsnit 5 (uddrag) – Vejforhold\n5.2 Risikoforhold ved vejene\nAfsnit 6 (uddrag) – Grundregler for færdsel\n6.2.3 Signalgivning\n6.2.4 Tegngivning\n6.2.5 Brug af lys\n6.2.6 Fri passage for bestemte trafikanter\n6.2.7 Personer og gods mv.\n6.2.8 Motorstop og slæbning mv.',
       null),
      (p_school_id, v_course, 3, 'Grundlæggende teori- og kørselsmodul på vej', 8, 6, 0,
       E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.1 Igangsætning og standsning ved kørebanekant*\n7.2 Placering under ligeudkørsel*\n7.3 Hastighed under ligeudkørsel*\n7.6 Kørsel forbi holdende køretøjer og gående mv.*\n7.7 Møde*\n7.8 Kørsel foran eller efter andre*\n7.4 Vognbaneskift og sammenfletning (mindre trafikeret vej)\n7.10 Kørsel i trafiksanerede områder\n7.11 Fremkørsel mod kryds (mindre trafikeret vej)\n7.12 Ligeudkørsel i kryds (mindre trafikeret vej)\n7.13 Højresving i kryds (mindre trafikeret vej)\n7.14 Venstresving i kryds (mindre trafikeret vej)\n7.15 Kørsel i rundkørsel (mindre trafikeret vej)',
       '* Eleven skal have gennemført afsnit 7.1–7.3 og 7.6–7.8 i praksis, før øvrige emner i praksis kan påbegyndes.'),
      (p_school_id, v_course, 4, 'Udvidet teori- og kørselsmodul på vej', 9, 6, 1,
       E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.4 Vognbaneskift og sammenfletning*\n7.11 Fremkørsel mod kryds*\n7.12 Ligeudkørsel i kryds*\n7.13 Højresving i kryds*\n7.14 Venstresving i kryds*\n7.15 Kørsel i rundkørsel*\n7.5 Vending og baglænskørsel\n7.9 Overhaling\n7.16 Kørsel på motorvej\n7.16.6 Kørsel på motortrafikvej\n7.17 Kørsel ved siden af andre\n7.18 Standsning og parkering\n7.19 Kørsel i mørke og i lygtetændingstiden i øvrigt\n7.20 Kørsel i tunnel\n7.21 Kørsel ved letbane\nAfsnit 8 – Særlige risikoforhold i trafikken\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.2 Indstilling til køreprøve\n10.2 Køreprøvens gennemførelse\n10.3 Lovbestemmelser om kørekort',
       v_m2_note),
      (p_school_id, v_course, 5, 'Afsluttende teori- og kørselsmodul', 1, 9, 0,
       E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.22 Afsluttende øvelseskørsel på vej\nAfsnit 9 – Manøvrer på køreteknisk anlæg*',
       v_m3_note);
  else
    -- C, C/E og D: tre moduler.
    insert into public.course_modules (school_id, course_id, number, name, min_theory, min_driving, min_dark, topics, notes)
    values
      (p_school_id, v_course, 1, 'Grundlæggende teori- og kørselsmodul på vej',
       case when p_template = 'CE-1.1' then 7 else 8 end, 5, 0,
       v_intro || E'\n' ||
         case when p_template = 'CE-1.1' then 'Afsnit 1 – Påhængskøretøjets indretning, udstyr og dokumenter'
              else 'Afsnit 1 – Køretøjets indretning, udstyr og dokumenter' end
         || E'\n' || v_m1_rest,
       v_m1_note),
      (p_school_id, v_course, 2, 'Udvidet teori- og kørselsmodul på vej',
       case when p_template = 'CE-1.1' then 5 else 7 end, 5,
       case when p_template = 'CE-1.1' then 0 else 1 end,
       v_m2_start || case when p_template = 'CE-1.1' then '' else v_m2_dark end || v_m2_end,
       v_m2_note),
      (p_school_id, v_course, 3, 'Afsluttende teori- og kørselsmodul på vej', 1, 8, 0, v_m3, v_m3_note);
  end if;

  return v_course;
end;
$$;
