REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;