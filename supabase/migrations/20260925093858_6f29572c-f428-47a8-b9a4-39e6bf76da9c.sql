-- Parents: children attendance & behavior
CREATE POLICY "Parents can view linked children behavior" ON public.behavior_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = behavior_records.student_id));

-- Teacher-scoped grade writes
DROP POLICY IF EXISTS "Staff manage grades" ON public.grades;
CREATE POLICY "Management manage grades" ON public.grades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Teachers manage grades for their classes" ON public.grades FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'teacher') AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.class_teachers ct ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
      JOIN public.students s ON s.id = grades.student_id AND s.class_id = e.class_id
      WHERE e.id = grades.exam_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'teacher') AND EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.class_teachers ct ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
      JOIN public.students s ON s.id = grades.student_id AND s.class_id = e.class_id
      WHERE e.id = grades.exam_id)
  );

-- Overview stats: management only
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
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.prevent_late_override() FROM anon, authenticated, public;

-- Tighter read scopes
DROP POLICY IF EXISTS "Anyone authenticated can view classes" ON public.classes;
CREATE POLICY "Staff and teachers can view classes" ON public.classes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.exams;
CREATE POLICY "Staff and teachers can view exams" ON public.exams FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.library_items;
CREATE POLICY "Staff and teachers can view library items" ON public.library_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.school_decisions;
CREATE POLICY "Staff and teachers can view school decisions" ON public.school_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.school_trips;
CREATE POLICY "Staff and teachers can view school trips" ON public.school_trips FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));

-- Owner whitelist
INSERT INTO public.staff_whitelist (email, full_name, role, note)
VALUES
  ('boukaachey@gmail.com', 'Owner (boukaachey)', 'admin', 'Site owner'),
  ('boukaacheyounes@gmail.com', 'Owner (boukaacheyounes)', 'admin', 'Site owner')
ON CONFLICT (full_name) DO UPDATE
  SET email = EXCLUDED.email, role = 'admin', note = EXCLUDED.note;

-- Appearance settings
CREATE OR REPLACE FUNCTION public.set_appearance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_appearance_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.appearance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX appearance_settings_user_key ON public.appearance_settings (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX appearance_settings_global_key ON public.appearance_settings ((is_global)) WHERE is_global;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appearance_settings TO authenticated;
GRANT ALL ON public.appearance_settings TO service_role;
ALTER TABLE public.appearance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read appearance settings" ON public.appearance_settings FOR SELECT TO authenticated
  USING (is_global OR user_id = auth.uid());
CREATE POLICY "Users manage their own appearance" ON public.appearance_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() AND NOT is_global) WITH CHECK (user_id = auth.uid() AND NOT is_global);
CREATE POLICY "Admins manage the shared appearance" ON public.appearance_settings FOR ALL TO authenticated
  USING (is_global AND public.has_role(auth.uid(), 'admin')) WITH CHECK (is_global AND public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER appearance_settings_updated_at BEFORE UPDATE ON public.appearance_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_appearance_updated_at();

-- Schedule slots
CREATE TABLE public.schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_slots TO authenticated;
GRANT ALL ON public.schedule_slots TO service_role;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule read" ON public.schedule_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedule write" ON public.schedule_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
CREATE TRIGGER trg_schedule_slots_updated_at BEFORE UPDATE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_schedule_slots_class ON public.schedule_slots(class_id, weekday, start_time);

-- Homework
CREATE TABLE public.homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework TO authenticated;
GRANT ALL ON public.homework TO service_role;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homework read" ON public.homework FOR SELECT TO authenticated USING (true);
CREATE POLICY "homework write" ON public.homework FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
CREATE TRIGGER trg_homework_updated_at BEFORE UPDATE ON public.homework FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_homework_class_due ON public.homework(class_id, due_date DESC);

-- Student goals
CREATE TABLE public.student_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_goals TO authenticated;
GRANT ALL ON public.student_goals TO service_role;
ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals owner all" ON public.student_goals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()));
CREATE POLICY "goals staff read" ON public.student_goals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_student_goals_updated_at BEFORE UPDATE ON public.student_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_student_goals_student ON public.student_goals(student_id);

-- Absence justifications
CREATE TABLE public.absence_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  absence_date date,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_justifications TO authenticated;
GRANT ALL ON public.absence_justifications TO service_role;
ALTER TABLE public.absence_justifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "justif owner read" ON public.absence_justifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = absence_justifications.student_id AND ps.parent_user_id = auth.uid()));
CREATE POLICY "justif owner insert" ON public.absence_justifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = absence_justifications.student_id AND ps.parent_user_id = auth.uid()));
CREATE POLICY "justif staff all" ON public.absence_justifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_absence_justifications_updated_at BEFORE UPDATE ON public.absence_justifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_absence_justifications_student ON public.absence_justifications(student_id, created_at DESC);

-- Parent meeting requests
CREATE TABLE public.meeting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  preferred_date date,
  preferred_slot text,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_requests TO authenticated;
GRANT ALL ON public.meeting_requests TO service_role;
ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents read own meeting requests" ON public.meeting_requests FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());
CREATE POLICY "Parents create meeting requests" ON public.meeting_requests FOR INSERT TO authenticated
  WITH CHECK (parent_user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_user_id = auth.uid() AND ps.student_id = meeting_requests.student_id));
CREATE POLICY "Staff manage meeting requests" ON public.meeting_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_meeting_requests_updated_at BEFORE UPDATE ON public.meeting_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_meeting_requests_parent ON public.meeting_requests(parent_user_id, created_at DESC);

ALTER TABLE public.schedule_slots REPLICA IDENTITY FULL;
ALTER TABLE public.homework REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.homework;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.absence_justifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.grades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.parent_student;