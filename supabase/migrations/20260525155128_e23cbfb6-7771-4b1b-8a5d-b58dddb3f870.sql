
ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS visitor_name text;

CREATE INDEX IF NOT EXISTS idx_card_scans_mode ON public.card_scans(mode);
CREATE INDEX IF NOT EXISTS idx_card_scans_student_scanned_at ON public.card_scans(student_id, scanned_at DESC);
