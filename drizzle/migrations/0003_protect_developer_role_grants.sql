DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins manage non-developer roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  (public.is_developer(auth.uid()))
  OR (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
    AND role::text <> 'developer'
  )
)
WITH CHECK (
  (public.is_developer(auth.uid()))
  OR (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
    AND role::text <> 'developer'
  )
);