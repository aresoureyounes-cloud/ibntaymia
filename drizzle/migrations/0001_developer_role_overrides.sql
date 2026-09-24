CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role::text = 'developer')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'developer'
  )
$$;

REVOKE ALL ON FUNCTION public.is_developer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_developer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_developer(uuid) TO authenticated;