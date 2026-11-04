
-- Whitelist owner emails as admin (idempotent)
INSERT INTO public.staff_whitelist (email, full_name, role, note)
VALUES
  ('boukaachey@gmail.com', 'Owner (boukaachey)', 'admin', 'Site owner'),
  ('boukaacheyounes@gmail.com', 'Owner (boukaacheyounes)', 'admin', 'Site owner')
ON CONFLICT (full_name) DO UPDATE
  SET email = EXCLUDED.email, role = 'admin', note = EXCLUDED.note;

-- If accounts already exist, grant admin/director/supervisor now
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r
FROM auth.users u
CROSS JOIN unnest(ARRAY['admin','director','supervisor']::public.app_role[]) r
WHERE lower(u.email) IN ('boukaachey@gmail.com','boukaacheyounes@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
