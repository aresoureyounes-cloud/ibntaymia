CREATE OR REPLACE FUNCTION public.notify_parents_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sname text; sess record; lbl text;
BEGIN
  IF NEW.status NOT IN ('absent','late') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT full_name INTO sname FROM students WHERE id = NEW.student_id;
  SELECT session_date, subject, period INTO sess FROM attendance_sessions WHERE id = NEW.session_id;
  lbl := CASE NEW.status WHEN 'absent' THEN 'غياب' ELSE 'تأخر' END;
  INSERT INTO notifications (recipient_id, recipient_label, title, body, channel, status, related_student_id, created_by)
  SELECT ps.parent_user_id, 'parent',
    'تسجيل ' || lbl || ': ' || coalesce(sname,'التلميذ'),
    'التاريخ: ' || coalesce(sess.session_date::text,'—')
      || coalesce(' — المادة: ' || sess.subject,'')
      || coalesce(' — الحصة: ' || sess.period,'')
      || coalesce(' — ملاحظة: ' || NEW.note,''),
    'inapp','sent', NEW.student_id, auth.uid()
  FROM parent_student ps WHERE ps.student_id = NEW.student_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_parents_attendance ON public.attendance_records;
CREATE TRIGGER trg_notify_parents_attendance
AFTER INSERT OR UPDATE OF status ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_attendance();