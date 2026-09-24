
-- Tighten EXECUTE grants on SECURITY DEFINER functions.
-- RLS policies reference has_role/get_user_roles via the definer context, so
-- revoking from PUBLIC/anon does not break policy evaluation, it only stops
-- signed-out / anon callers from probing these functions directly.

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

-- Overview stats: only management roles should count all rows platform-wide.
-- Wrap in an authorization check so a stray call from a lesser role errors out.
CREATE OR REPLACE FUNCTION public.get_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'students', (SELECT count(*) FROM public.students),
    'cards', (SELECT count(*) FROM public.rfid_cards),
    'attendance', (SELECT count(*) FROM public.attendance_records),
    'notifications', (SELECT count(*) FROM public.notifications),
    'classes', (SELECT count(*) FROM public.classes),
    'scans', (SELECT count(*) FROM public.card_scans)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated, service_role;
