-- 1) أي أستاذ يقرأ كل جلسات الحضور (استخلاف / حصة إضافية / متابعة)
DROP POLICY IF EXISTS "Scoped session reads" ON public.attendance_sessions;
CREATE POLICY "Scoped session reads" ON public.attendance_sessions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'director'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (SELECT 1 FROM public.students st WHERE st.class_id = attendance_sessions.class_id AND st.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_student ps JOIN public.students st ON st.id = ps.student_id WHERE ps.parent_user_id = auth.uid() AND st.class_id = attendance_sessions.class_id)
);

-- 2) أي أستاذ يقرأ كل سجلات الحضور
DROP POLICY IF EXISTS "Staff or self can view attendance" ON public.attendance_records;
CREATE POLICY "Staff or self can view attendance" ON public.attendance_records
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'director'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_records.student_id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = attendance_records.student_id AND ps.parent_user_id = auth.uid())
);

-- 3) تصحيح الخطأ: الأستاذ والطاقم يستطيعون تغيير حالة "متأخر" مباشرة بدون تبرير مسبق
CREATE OR REPLACE FUNCTION public.prevent_late_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'late'
     AND NEW.status <> 'late'
     AND OLD.justified_at IS NULL
     AND NEW.justified_at IS NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'director'::app_role)
       OR public.has_role(auth.uid(), 'supervisor'::app_role)
       OR public.has_role(auth.uid(), 'teacher'::app_role)
     ) THEN
    RAISE EXCEPTION 'LATE_NOT_JUSTIFIED: لا يمكن تعديل حالة الطالب من "متأخر" قبل تبرير التأخر.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;