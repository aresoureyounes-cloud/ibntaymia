ALTER TABLE public.staff_whitelist ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS staff_whitelist_email_key ON public.staff_whitelist (lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _email text;
  _whitelisted_role app_role;
BEGIN
  _email := lower(NEW.email);
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name',''),
    NULLIF(NEW.raw_user_meta_data->>'name',''),
    NEW.email
  );

  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  IF _email IN ('boukaachey@gmail.com','boukaacheyounes@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES
      (NEW.id, 'admin'::app_role),
      (NEW.id, 'director'::app_role),
      (NEW.id, 'supervisor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    SELECT role INTO _whitelisted_role
      FROM public.staff_whitelist
      WHERE email IS NOT NULL AND lower(email) = _email
      LIMIT 1;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE(_whitelisted_role, 'student'::app_role))
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS justified_at timestamptz,
  ADD COLUMN IF NOT EXISTS justified_by uuid,
  ADD COLUMN IF NOT EXISTS justification_note text;

CREATE OR REPLACE FUNCTION public.prevent_late_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'late'
     AND NEW.status <> 'late'
     AND OLD.justified_at IS NULL
     AND NEW.justified_at IS NULL THEN
    RAISE EXCEPTION 'LATE_NOT_JUSTIFIED: لا يمكن تعديل حالة الطالب من "متأخر" قبل تبرير التأخر.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_late_override ON public.attendance_records;
CREATE TRIGGER trg_prevent_late_override
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.prevent_late_override();

CREATE TABLE IF NOT EXISTS public.parent_student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation text DEFAULT 'parent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_student TO authenticated;
GRANT ALL ON public.parent_student TO service_role;
ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents see own links" ON public.parent_student FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Staff manage parent links" ON public.parent_student FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor'));
CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student ON public.parent_student(student_id);
CREATE INDEX IF NOT EXISTS idx_behavior_records_student ON public.behavior_records(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  score numeric(5,2),
  max_score numeric(5,2) NOT NULL DEFAULT 20,
  remark text,
  entered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage grades" ON public.grades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students see own grades" ON public.grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = grades.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Parents see linked children grades" ON public.grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = grades.student_id AND ps.parent_user_id = auth.uid()));
CREATE INDEX idx_grades_exam ON public.grades(exam_id);
CREATE INDEX idx_grades_student ON public.grades(student_id);
CREATE TRIGGER grades_set_updated_at BEFORE UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  subject text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id, subject)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage class_teachers" ON public.class_teachers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));
CREATE POLICY "Staff or self can view class_teachers" ON public.class_teachers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR teacher_id = auth.uid());
CREATE TRIGGER trg_class_teachers_updated_at BEFORE UPDATE ON public.class_teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Authenticated can view sessions" ON public.attendance_sessions;
CREATE POLICY "Scoped session reads" ON public.attendance_sessions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = attendance_sessions.class_id AND ct.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.students st WHERE st.class_id = attendance_sessions.class_id AND st.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps JOIN public.students st ON st.id = ps.student_id WHERE ps.parent_user_id = auth.uid() AND st.class_id = attendance_sessions.class_id)
  );

DROP POLICY IF EXISTS "Staff or self can view students" ON public.students;
CREATE POLICY "Staff or self can view students" ON public.students FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'gate_monitor')
    OR user_id = auth.uid()
    OR (public.has_role(auth.uid(), 'teacher') AND EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.teacher_id = auth.uid() AND ct.class_id = students.class_id))
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = students.id)
  );

DROP POLICY IF EXISTS "Staff or self can view attendance" ON public.attendance_records;
CREATE POLICY "Staff or self can view attendance" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR (public.has_role(auth.uid(), 'teacher') AND EXISTS (SELECT 1 FROM public.attendance_sessions s WHERE s.id = attendance_records.session_id AND s.teacher_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_records.student_id AND s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = attendance_records.student_id AND ps.parent_user_id = auth.uid())
  );

CREATE TABLE public.profile_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profile_audit_log_user_id_idx ON public.profile_audit_log(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.profile_audit_log TO authenticated;
GRANT ALL ON public.profile_audit_log TO service_role;
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own audit rows" ON public.profile_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own audit rows" ON public.profile_audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all audit rows" ON public.profile_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own avatar or staff read all" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor')));
CREATE POLICY "Users can upload to own avatar folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);