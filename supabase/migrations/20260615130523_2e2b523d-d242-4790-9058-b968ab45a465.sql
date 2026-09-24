
-- Grades table for exam results entry
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

-- Staff (admin, director, supervisor, teacher) can manage grades
CREATE POLICY "Staff manage grades"
  ON public.grades
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
  );

-- Students see their own grades
CREATE POLICY "Students see own grades"
  ON public.grades
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
    )
  );

-- Parents see their linked children's grades
CREATE POLICY "Parents see linked children grades"
  ON public.grades
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.student_id = grades.student_id
        AND ps.parent_user_id = auth.uid()
    )
  );

CREATE INDEX idx_grades_exam ON public.grades(exam_id);
CREATE INDEX idx_grades_student ON public.grades(student_id);

CREATE TRIGGER grades_set_updated_at
  BEFORE UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
