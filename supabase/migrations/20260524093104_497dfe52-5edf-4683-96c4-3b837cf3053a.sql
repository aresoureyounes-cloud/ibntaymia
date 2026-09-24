
REVOKE EXECUTE ON FUNCTION public.get_overview_stats() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated;
