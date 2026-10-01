CREATE TABLE public.role_permissions (
  role app_role NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (role, permission)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perm read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "perm admin write" ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

CREATE TABLE public.user_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  allowed boolean NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (user_id, permission)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ovr read" ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));
CREATE POLICY "ovr admin write" ON public.user_permission_overrides FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

CREATE TABLE public.access_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_settings TO authenticated;
GRANT ALL ON public.access_settings TO service_role;
ALTER TABLE public.access_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acs read" ON public.access_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "acs admin write" ON public.access_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

INSERT INTO public.access_settings(key, value) VALUES
  ('attendance_edit_window_hours', 0),
  ('attendance_backdate_days', 7);

-- Defaults
INSERT INTO public.role_permissions(role, permission, allowed)
SELECT r::app_role, p, true FROM (VALUES
  ('teacher','attendance.take'),('teacher','attendance.replacement'),('teacher','attendance.extra'),
  ('teacher','attendance.edit_after_save'),('teacher','attendance.override_late'),
  ('teacher','attendance.view_all_classes'),('teacher','homework.manage'),('teacher','notifications.send'),
  ('teacher','schedule.view_all'),
  ('supervisor','attendance.take'),('supervisor','attendance.justify'),('supervisor','attendance.delete_session'),
  ('supervisor','behavior.manage'),('supervisor','notifications.send'),('supervisor','reports.export'),
  ('supervisor','students.manage'),('supervisor','meetings.review'),
  ('director','attendance.justify'),('director','attendance.delete_session'),('director','reports.export'),
  ('director','schedule.manage'),('director','students.manage'),('director','notifications.send'),
  ('director','behavior.manage'),('director','meetings.review'),('director','classes.manage'),
  ('parent','justification.submit'),('parent','meetings.request'),
  ('student','justification.submit')
) v(r,p);

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN has_role(_user_id,'developer') OR has_role(_user_id,'admin') THEN true
    WHEN EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.user_id=_user_id AND o.permission=_perm)
      THEN (SELECT o.allowed FROM user_permission_overrides o WHERE o.user_id=_user_id AND o.permission=_perm)
    ELSE COALESCE((SELECT bool_or(rp.allowed) FROM role_permissions rp
                   JOIN user_roles ur ON ur.role = rp.role
                   WHERE ur.user_id=_user_id AND rp.permission=_perm), false)
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- Management (admin/director/supervisor) is exempt from teacher attendance limits
CREATE OR REPLACE FUNCTION public.is_management(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(_uid,'admin') OR has_role(_uid,'director') OR has_role(_uid,'supervisor') OR has_role(_uid,'developer')
$$;
GRANT EXECUTE ON FUNCTION public.is_management(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_session_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); win numeric; back numeric; ref record;
BEGIN
  IF uid IS NULL OR is_management(uid) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT has_permission(uid,'attendance.take') THEN
      RAISE EXCEPTION 'PERM_DENIED: غير مسموح لك بتسجيل الحضور' USING ERRCODE='42501'; END IF;
    IF NEW.session_type='replacement' AND NOT has_permission(uid,'attendance.replacement') THEN
      RAISE EXCEPTION 'PERM_DENIED: الاستخلاف غير مسموح لحسابك' USING ERRCODE='42501'; END IF;
    IF NEW.session_type='extra' AND NOT has_permission(uid,'attendance.extra') THEN
      RAISE EXCEPTION 'PERM_DENIED: الحصص الإضافية غير مسموحة لحسابك' USING ERRCODE='42501'; END IF;
    SELECT value INTO back FROM access_settings WHERE key='attendance_backdate_days';
    IF back IS NOT NULL AND back >= 0 AND NEW.session_date < (current_date - back::int) THEN
      RAISE EXCEPTION 'PERM_DENIED: لا يمكن تسجيل حضور لتاريخ أقدم من % أيام', back::int USING ERRCODE='42501'; END IF;
    IF NEW.session_date > current_date THEN
      RAISE EXCEPTION 'PERM_DENIED: لا يمكن تسجيل حضور لتاريخ مستقبلي' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT has_permission(uid,'attendance.delete_session') THEN
      RAISE EXCEPTION 'PERM_DENIED: حذف جلسة الحضور غير مسموح لحسابك' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF NOT has_permission(uid,'attendance.edit_after_save') THEN
    RAISE EXCEPTION 'PERM_DENIED: تعديل الحضور بعد الحفظ غير مسموح لحسابك' USING ERRCODE='42501'; END IF;
  SELECT value INTO win FROM access_settings WHERE key='attendance_edit_window_hours';
  IF win IS NOT NULL AND win > 0 AND OLD.created_at < now() - make_interval(hours => win::int) THEN
    RAISE EXCEPTION 'PERM_DENIED: انتهت المدة المسموحة للتعديل (% ساعة)', win::int USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_session_permissions() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_session_perms BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_session_permissions();

CREATE OR REPLACE FUNCTION public.enforce_record_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); win numeric; s_created timestamptz;
BEGIN
  IF uid IS NULL OR is_management(uid) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT has_permission(uid,'attendance.take') THEN
      RAISE EXCEPTION 'PERM_DENIED: غير مسموح لك بتسجيل الحضور' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.note IS NOT DISTINCT FROM OLD.note THEN RETURN NEW; END IF;
  IF NOT has_permission(uid,'attendance.edit_after_save') THEN
    RAISE EXCEPTION 'PERM_DENIED: تعديل الحضور بعد الحفظ غير مسموح لحسابك' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='late' AND NEW.status<>'late' AND NOT has_permission(uid,'attendance.override_late') THEN
    RAISE EXCEPTION 'PERM_DENIED: تغيير حالة "متأخر" غير مسموح لحسابك' USING ERRCODE='42501'; END IF;
  SELECT value INTO win FROM access_settings WHERE key='attendance_edit_window_hours';
  SELECT created_at INTO s_created FROM attendance_sessions WHERE id = OLD.session_id;
  IF win IS NOT NULL AND win > 0 AND s_created < now() - make_interval(hours => win::int) THEN
    RAISE EXCEPTION 'PERM_DENIED: انتهت المدة المسموحة للتعديل (% ساعة)', win::int USING ERRCODE='42501'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_record_permissions() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_record_perms BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_record_permissions();