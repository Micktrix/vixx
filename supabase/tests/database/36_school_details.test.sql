-- Skolens oplysninger (CVR-nr., adresse) og logo: kun admin retter, CVR-nr. er 8 cifre, eleven kan se sin
-- skoles oplysninger (de står på modulplanen), og logoer lægges kun op af serveren.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'school-logos'$$,
  $$values (true, 1048576::bigint, array['image/png', 'image/jpeg', 'image/webp'])$$,
  'Logo-bucket: offentlig, højst 1 MB, kun PNG, JPEG og WebP');

set local role authenticated;

-- Admin (Anne).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.schools set cvr = '87654321', address = 'Nyvej 2, 8000 Aarhus C' where id = '00000000-0000-4000-a000-000000000001'$$,
  'Admin retter CVR-nr. og adresse');
select throws_ok(
  $$update public.schools set cvr = '1234' where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'CVR-nr. skal være 8 cifre');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('school-logos', '00000000-0000-4000-a000-000000000001/logo.png')$$,
  '42501', null, 'Logoer lægges ikke op direkte fra appen (kun serveren)');

-- Kontoret (Ole) kan ikke rette.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
update public.schools set cvr = '11111111' where id = '00000000-0000-4000-a000-000000000001';
select is((select cvr from public.schools where id = '00000000-0000-4000-a000-000000000001'), '87654321', 'Kontoret kan ikke rette skolens oplysninger');

-- Eleven (Emil) ser sin skoles oplysninger, men kan ikke rette dem.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select address from public.schools), 'Nyvej 2, 8000 Aarhus C', 'Eleven ser skolens adresse');
update public.schools set address = 'Elevvej 3';
select is((select address from public.schools), 'Nyvej 2, 8000 Aarhus C', 'Eleven kan ikke rette skolens oplysninger');
reset role;

select * from finish();
rollback;
