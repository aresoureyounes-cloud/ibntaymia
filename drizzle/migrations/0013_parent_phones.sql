ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_phone text, ADD COLUMN IF NOT EXISTS mother_phone text, ADD COLUMN IF NOT EXISTS extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.students SET father_phone = guardian_phone WHERE father_phone IS NULL AND guardian_phone IS NOT NULL;
CREATE OR REPLACE FUNCTION public.sync_guardian_phone() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.guardian_phone IS NULL OR NEW.guardian_phone = '' OR (TG_OP = 'UPDATE' AND (NEW.father_phone IS DISTINCT FROM OLD.father_phone OR NEW.mother_phone IS DISTINCT FROM OLD.mother_phone)) THEN
    NEW.guardian_phone := COALESCE(NULLIF(NEW.father_phone,''), NULLIF(NEW.mother_phone,''), NEW.guardian_phone);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS students_sync_guardian_phone ON public.students;
CREATE TRIGGER students_sync_guardian_phone BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_guardian_phone();