-- Per-trip look, shared by everyone on the trip: an accent colour (one of the
-- app's palettes, all checked for contrast) and an optional cover photo.

alter table public.trips
  add column theme_color text check (theme_color in ('blue', 'purple', 'green', 'orange', 'pink', 'teal', 'red', 'slate')),
  add column cover_path text check (cover_path is null or cover_path like (id::text || '/%'));

-- Cover photos: private bucket, one folder per trip: trip-covers/<trip_id>/<file>.
-- Small images only (the app shrinks them before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy trip_covers_read on storage.objects for select to authenticated
  using (bucket_id = 'trip-covers' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy trip_covers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-covers' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy trip_covers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-covers' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

-- Members may change the trip's look (row-level policy trips_update still applies)
grant update (theme_color, cover_path) on public.trips to authenticated;
