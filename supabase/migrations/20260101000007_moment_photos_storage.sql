-- Private storage bucket for moment photos. `public = false` means Supabase
-- Storage refuses to serve any object in it via a plain public URL -- the
-- only way to read one is a signed URL, which the app mints server-side
-- (see createSignedMomentPhotoUrl in web/src/lib/photos.ts) after checking
-- the requester can see the moment. This is the storage half of
-- CLAUDE.md non-negotiable #5.
insert into storage.buckets (id, name, public, file_size_limit)
values ('moment-photos', 'moment-photos', false, 20971520)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase itself. Objects are
-- keyed "<user_id>/<uuid>-<filename>", so a user's own folder is easy to
-- scope policies to.
create policy "a user can upload only into their own moment-photos folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'moment-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No select/update/delete policy for `authenticated` on storage.objects:
-- every read goes through a signed URL minted by the admin client (which
-- bypasses RLS entirely), never a direct client read of the object. This
-- keeps "photos are private" true even if a caller has the object path.
