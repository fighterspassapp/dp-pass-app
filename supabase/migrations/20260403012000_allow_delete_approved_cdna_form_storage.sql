-- Allow app client to delete approved CDNA forms once cadet confirms download.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow anon delete approved cdna forms'
  ) then
    create policy "Allow anon delete approved cdna forms"
    on storage.objects
    for delete
    to anon
    using (
      bucket_id = 'Form10PDF'
      and (storage.foldername(name))[1] = 'approved'
    );
  end if;
end $$;
