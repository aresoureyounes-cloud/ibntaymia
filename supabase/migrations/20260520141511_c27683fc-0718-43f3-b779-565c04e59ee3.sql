DROP FUNCTION IF EXISTS public.ensure_user_roles(app_role);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can create own profile during test'
  ) THEN
    CREATE POLICY "Users can create own profile during test"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Users can create own role during test'
  ) THEN
    CREATE POLICY "Users can create own role during test"
    ON public.user_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role::app_role
FROM auth.users u
CROSS JOIN (VALUES ('admin'), ('director'), ('supervisor')) AS r(role)
WHERE lower(u.email) IN ('boukaachey@gmail.com', 'boukaacheyounes@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;