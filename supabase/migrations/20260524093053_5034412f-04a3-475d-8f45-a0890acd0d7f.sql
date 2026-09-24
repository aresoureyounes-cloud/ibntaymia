
CREATE INDEX IF NOT EXISTS idx_card_scans_scanned_at ON public.card_scans (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_scans_card_uid ON public.card_scans (card_uid);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON public.attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_created_at ON public.attendance_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_card_uid ON public.rfid_cards (card_uid);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_student_id ON public.rfid_cards (student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_decisions_status_starts_at ON public.school_decisions (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students (user_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students (class_id);

CREATE OR REPLACE FUNCTION public.get_overview_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'students', (SELECT count(*) FROM public.students),
    'cards', (SELECT count(*) FROM public.rfid_cards),
    'attendance', (SELECT count(*) FROM public.attendance_records),
    'notifications', (SELECT count(*) FROM public.notifications),
    'classes', (SELECT count(*) FROM public.classes),
    'scans', (SELECT count(*) FROM public.card_scans)
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated, anon;
