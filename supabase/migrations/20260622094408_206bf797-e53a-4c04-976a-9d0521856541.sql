
DROP POLICY IF EXISTS "Authenticated can view sessions" ON public.attendance_sessions;

CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  subject text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id, subject)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage class_teachers" ON public.class_teachers;
CREATE POLICY "Admins manage class_teachers" ON public.class_teachers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'director'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'director'::app_role));

DROP POLICY IF EXISTS "Staff or self can view class_teachers" ON public.class_teachers;
CREATE POLICY "Staff or self can view class_teachers" ON public.class_teachers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR teacher_id = auth.uid()
  );

DROP TRIGGER IF EXISTS trg_class_teachers_updated_at ON public.class_teachers;
CREATE TRIGGER trg_class_teachers_updated_at
  BEFORE UPDATE ON public.class_teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Scoped session reads" ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = attendance_sessions.class_id AND ct.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.class_id = attendance_sessions.class_id AND st.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.parent_student ps
      JOIN public.students st ON st.id = ps.student_id
      WHERE ps.parent_user_id = auth.uid() AND st.class_id = attendance_sessions.class_id
    )
  );

DROP POLICY IF EXISTS "Staff or self can view students" ON public.students;
CREATE POLICY "Staff or self can view students" ON public.students
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'gate_monitor'::app_role)
    OR user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'teacher'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.class_teachers ct
        WHERE ct.teacher_id = auth.uid() AND ct.class_id = students.class_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.parent_user_id = auth.uid() AND ps.student_id = students.id
    )
  );

DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;
CREATE POLICY "Users read own avatar or staff read all" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'director'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );
