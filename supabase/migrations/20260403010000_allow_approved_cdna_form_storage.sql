-- Allow app client to store/read generated approved CDNA forms in storage.
-- Scope is restricted to the Form10PDF bucket and the approved/ prefix.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow anon upload approved cdna forms'
  ) then
    create policy "Allow anon upload approved cdna forms"
    on storage.objects
    for insert
    to anon
    with check (
      bucket_id = 'Form10PDF'
      and (storage.foldername(name))[1] = 'approved'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow anon read approved cdna forms'
  ) then
    create policy "Allow anon read approved cdna forms"
    on storage.objects
    for select
    to anon
    using (
      bucket_id = 'Form10PDF'
      and (storage.foldername(name))[1] = 'approved'
    );
  end if;
end $$;
