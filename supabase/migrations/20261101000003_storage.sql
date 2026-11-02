-- Receipt photos: private bucket, one folder per trip: receipts/<trip_id>/<file>

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));
