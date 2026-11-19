-- Skolens oplysninger og logo (19. nov. 2026). Modulplanen (trin E8, del 6) skal have skolens navn, CVR-nr.,
-- adresse og telefon (side 3: "Oplysninger om køreskole"). Telefon findes allerede (`contact_phone`).
-- Admin taster dem under Indstillinger → Generelt; platform-ejeren kan også sætte dem, når skolen oprettes.
-- Logoet vises i appen, så lærere og elever kan se, hvilken skole de er på. Det ligger i en offentlig
-- Storage-bucket (et logo er ikke hemmeligt); kun serveren lægger filer op (efter tjek af admin).

alter table public.schools
  add column cvr text check (cvr ~ '^[0-9]{8}$'),
  add column address text check (char_length(address) <= 200),
  add column logo_path text check (char_length(logo_path) <= 200);

-- Offentlig bucket til logoer: højst 1 MB, kun PNG, JPEG og WebP (ikke SVG, som kan indeholde scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
