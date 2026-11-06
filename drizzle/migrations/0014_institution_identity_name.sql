INSERT INTO public.institution_settings (id, name, address, phone, email, academic_year, logo_data_url, published_origin)
VALUES (true, 'ثانوية تقي الدين ابن تيمية', 'قسنطينة، الجزائر', '', '', '2026-2027', '', 'https://ibntaymia.lovable.app')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name WHERE public.institution_settings.name = '';