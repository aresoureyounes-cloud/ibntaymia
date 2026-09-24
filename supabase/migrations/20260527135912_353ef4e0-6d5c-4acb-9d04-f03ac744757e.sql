ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS justified_at timestamptz,
  ADD COLUMN IF NOT EXISTS justified_by uuid,
  ADD COLUMN IF NOT EXISTS justification_note text;

CREATE OR REPLACE FUNCTION public.prevent_late_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only constrain transitions out of 'late'
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'late'
     AND NEW.status <> 'late'
     AND OLD.justified_at IS NULL
     AND NEW.justified_at IS NULL THEN
    RAISE EXCEPTION 'LATE_NOT_JUSTIFIED: لا يمكن تعديل حالة الطالب من "متأخر" قبل تبرير التأخر.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_late_override ON public.attendance_records;
CREATE TRIGGER trg_prevent_late_override
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.prevent_late_override();