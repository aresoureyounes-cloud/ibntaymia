REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_management(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_session_permissions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_record_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_management(uuid) TO authenticated, service_role;