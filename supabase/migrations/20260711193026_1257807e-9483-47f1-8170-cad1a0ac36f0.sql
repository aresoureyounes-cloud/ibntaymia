CREATE TABLE IF NOT EXISTS public.grades (
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
CREATE INDEX IF NOT EXISTS idx_grades_exam ON public.grades(exam_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(student_id);
CREATE TRIGGER grades_set_updated_at BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Students see own grades" ON public.grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = grades.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Parents see linked children grades" ON public.grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = grades.student_id AND ps.parent_user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id, subject)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage class_teachers" ON public.class_teachers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director'));
CREATE POLICY "Staff or self can view class_teachers" ON public.class_teachers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor') OR teacher_id = auth.uid());
CREATE TRIGGER trg_class_teachers_updated_at BEFORE UPDATE ON public.class_teachers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Management manage grades" ON public.grades FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Teachers manage grades for their classes" ON public.grades FOR ALL TO authenticated
  USING (has_role(auth.uid(),'teacher') AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.class_teachers ct ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
    JOIN public.students s ON s.id = grades.student_id AND s.class_id = e.class_id
    WHERE e.id = grades.exam_id))
  WITH CHECK (has_role(auth.uid(),'teacher') AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.class_teachers ct ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
    JOIN public.students s ON s.id = grades.student_id AND s.class_id = e.class_id
    WHERE e.id = grades.exam_id));

DROP POLICY IF EXISTS "Authenticated can view sessions" ON public.attendance_sessions;
CREATE POLICY "Scoped session reads" ON public.attendance_sessions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = attendance_sessions.class_id AND ct.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.students st WHERE st.class_id = attendance_sessions.class_id AND st.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps JOIN public.students st ON st.id = ps.student_id
               WHERE ps.parent_user_id = auth.uid() AND st.class_id = attendance_sessions.class_id)
  );

CREATE POLICY "Parents can view linked children attendance" ON public.attendance_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = attendance_records.student_id));
CREATE POLICY "Parents can view linked children behavior" ON public.behavior_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = behavior_records.student_id));

DROP POLICY IF EXISTS "Staff or self can view students" ON public.students;
CREATE POLICY "Staff or self can view students" ON public.students FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'gate_monitor') OR user_id = auth.uid()
    OR (has_role(auth.uid(),'teacher') AND EXISTS (
      SELECT 1 FROM public.class_teachers ct WHERE ct.teacher_id = auth.uid() AND ct.class_id = students.class_id))
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = students.id)
  );

CREATE TABLE IF NOT EXISTS public.profile_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_audit_log_user_id_idx ON public.profile_audit_log(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.profile_audit_log TO authenticated;
GRANT ALL ON public.profile_audit_log TO service_role;
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own audit rows" ON public.profile_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own audit rows" ON public.profile_audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all audit rows" ON public.profile_audit_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

-- Avatars bucket policies (bucket created separately)
CREATE POLICY "Users read own avatar or staff read all" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')));
CREATE POLICY "Users can upload to own avatar folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.get_overview_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000'; END IF;
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')) THEN
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
END; $$;
REVOKE ALL ON FUNCTION public.get_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Realtime scoped by role" ON realtime.messages;
CREATE POLICY "Realtime scoped by role" ON realtime.messages FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR (has_role(auth.uid(),'teacher') AND realtime.topic() ~ '^(attendance|behavior|exams|notifications|classes|students):[A-Za-z0-9_-]+')
    OR (has_role(auth.uid(),'gate_monitor') AND realtime.topic() ~ '^(card_scans|rfid_cards|notifications|gate):[A-Za-z0-9_-]+')
    OR (has_role(auth.uid(),'parent') AND realtime.topic() = ('notifications:user:' || auth.uid()::text))
    OR (has_role(auth.uid(),'student') AND realtime.topic() IN (
        'notifications:user:' || auth.uid()::text,
        'grades:user:' || auth.uid()::text,
        'attendance:user:' || auth.uid()::text))
  );