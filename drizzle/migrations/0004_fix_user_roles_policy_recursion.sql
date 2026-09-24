CREATE OR REPLACE FUNCTION public.is_strict_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION public.is_strict_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_strict_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_strict_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins manage non-developer roles" ON public.user_roles;

CREATE POLICY "Admins manage non-developer roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  public.is_developer(auth.uid())
  OR (public.is_strict_admin(auth.uid()) AND role::text <> 'developer')
)
WITH CHECK (
  public.is_developer(auth.uid())
  OR (public.is_strict_admin(auth.uid()) AND role::text <> 'developer')
);