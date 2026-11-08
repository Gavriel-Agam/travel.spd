-- 0016: a profile photo per trip member, shown in the member's circle instead
-- of their initial. Each person sets their own (members_update_self policy);
-- everyone on the trip can see it.

alter table public.trip_members
  add column if not exists photo_path text check (photo_path is null or photo_path like (trip_id::text || '/%'));

-- Private bucket, one folder per trip: member-photos/<trip_id>/<file>.
-- Small images only (the app shrinks them before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy member_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy member_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy member_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

grant update (photo_path) on public.trip_members to authenticated;
