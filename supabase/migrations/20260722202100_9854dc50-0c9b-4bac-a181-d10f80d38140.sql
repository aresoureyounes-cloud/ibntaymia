
-- 1) Lock down SECURITY DEFINER functions from anon (and public)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) Restrict overly-permissive SELECT policies to staff/teacher roles
DROP POLICY IF EXISTS "Anyone authenticated can view classes" ON public.classes;
CREATE POLICY "Staff and teachers can view classes"
ON public.classes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'director') OR
  public.has_role(auth.uid(),'supervisor') OR
  public.has_role(auth.uid(),'teacher')
);

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.exams;
CREATE POLICY "Staff and teachers can view exams"
ON public.exams FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'director') OR
  public.has_role(auth.uid(),'supervisor') OR
  public.has_role(auth.uid(),'teacher')
);

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.library_items;
CREATE POLICY "Staff and teachers can view library items"
ON public.library_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'director') OR
  public.has_role(auth.uid(),'supervisor') OR
  public.has_role(auth.uid(),'teacher')
);

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.school_decisions;
CREATE POLICY "Staff and teachers can view school decisions"
ON public.school_decisions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'director') OR
  public.has_role(auth.uid(),'supervisor') OR
  public.has_role(auth.uid(),'teacher')
);

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.school_trips;
CREATE POLICY "Staff and teachers can view school trips"
ON public.school_trips FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'director') OR
  public.has_role(auth.uid(),'supervisor') OR
  public.has_role(auth.uid(),'teacher')
);
