
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

CREATE POLICY "Parents see own links"
  ON public.parent_student FOR SELECT TO authenticated
  USING (
    parent_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Staff manage parent links"
  ON public.parent_student FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student ON public.parent_student(student_id);

-- Performance indexes for hot lookups
CREATE INDEX IF NOT EXISTS idx_card_scans_scanned_at ON public.card_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_scans_student ON public.card_scans(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_behavior_records_student ON public.behavior_records(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
