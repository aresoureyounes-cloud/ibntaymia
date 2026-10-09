
-- Attendance sessions
CREATE TABLE public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period TEXT,
  subject TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_sessions_class_date ON public.attendance_sessions(class_id, session_date DESC);

CREATE TRIGGER trg_att_sessions_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sessions"
  ON public.attendance_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage sessions"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'teacher')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'teacher')
  );

-- Attendance records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  CHECK (status IN ('present','absent','late','excused'))
);
CREATE INDEX idx_att_records_student ON public.attendance_records(student_id);
CREATE INDEX idx_att_records_session ON public.attendance_records(session_id);

CREATE TRIGGER trg_att_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view records"
  ON public.attendance_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage records"
  ON public.attendance_records FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'teacher')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'teacher')
  );

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_label TEXT,
  title TEXT NOT NULL,
  body TEXT,
  channel TEXT NOT NULL DEFAULT 'inapp',
  status TEXT NOT NULL DEFAULT 'sent',
  related_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (channel IN ('inapp','email','sms')),
  CHECK (status IN ('sent','simulated','failed','read'))
);
CREATE INDEX idx_notif_recipient ON public.notifications(recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipient or staff can view"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Staff can insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'director') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'teacher')
  );

CREATE POLICY "Recipient can mark read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
