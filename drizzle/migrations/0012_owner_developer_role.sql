CREATE TABLE IF NOT EXISTS public.account_login_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_login_codes TO service_role;
GRANT SELECT ON public.account_login_codes TO authenticated;
ALTER TABLE public.account_login_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own code read" ON public.account_login_codes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.grant_owner_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'boukaachey@gmail.com' THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT NEW.id, r FROM unnest(ARRAY['admin','director','supervisor','developer']::public.app_role[]) r
    ON CONFLICT DO NOTHING;
    INSERT INTO public.account_login_codes(code, user_id)
    VALUES ('IDR-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)), NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_owner_roles() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_owner_roles ON auth.users;
CREATE TRIGGER on_auth_user_owner_roles AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_roles();