
-- 1) Parents can view attendance of their linked children
CREATE POLICY "Parents can view linked children attendance"
ON public.attendance_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_user_id = auth.uid()
      AND ps.student_id = attendance_records.student_id
  )
);

-- 2) Parents can view behavior of their linked children
CREATE POLICY "Parents can view linked children behavior"
ON public.behavior_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_user_id = auth.uid()
      AND ps.student_id = behavior_records.student_id
  )
);

-- 3) Scope teacher grade writes to classes the teacher is assigned to.
-- Split the broad "Staff manage grades" ALL policy into:
--   a) Management (admin/director/supervisor) — unrestricted
--   b) Teachers  — only for exams whose class matches a class_teachers row for them,
--                  AND the student belongs to that same class.
DROP POLICY IF EXISTS "Staff manage grades" ON public.grades;

CREATE POLICY "Management manage grades"
ON public.grades
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'director'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'director'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "Teachers manage grades for their classes"
ON public.grades
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.exams e
    JOIN public.class_teachers ct
      ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
    JOIN public.students s
      ON s.id = grades.student_id AND s.class_id = e.class_id
    WHERE e.id = grades.exam_id
  )
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.exams e
    JOIN public.class_teachers ct
      ON ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
    JOIN public.students s
      ON s.id = grades.student_id AND s.class_id = e.class_id
    WHERE e.id = grades.exam_id
  )
);
