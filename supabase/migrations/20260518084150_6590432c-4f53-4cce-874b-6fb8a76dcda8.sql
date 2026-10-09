
-- RFID Cards table
CREATE TABLE public.rfid_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid TEXT NOT NULL UNIQUE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rfid_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cards"
ON public.rfid_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage cards"
ON public.rfid_cards FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));

CREATE TRIGGER trg_rfid_cards_updated
BEFORE UPDATE ON public.rfid_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Card scans table
CREATE TABLE public.card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  gate_id TEXT,
  scanned_by UUID,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_scans_scanned_at ON public.card_scans(scanned_at DESC);
CREATE INDEX idx_card_scans_card_uid ON public.card_scans(card_uid);

ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view scans"
ON public.card_scans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gate and staff can insert scans"
ON public.card_scans FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director')
  OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'gate_monitor')
);

CREATE POLICY "Staff manage scans"
ON public.card_scans FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));

-- Realtime
ALTER TABLE public.rfid_cards REPLICA IDENTITY FULL;
ALTER TABLE public.card_scans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_scans;
