-- Read-only, admin-scoped data for the clinic management dashboard.
CREATE OR REPLACE FUNCTION public.admin_clinic_directory()
RETURNS TABLE(id uuid, name text, timezone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.name, c.timezone FROM public.clinics c ORDER BY c.name, c.id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_doctor_assignments()
RETURNS TABLE(id uuid, name text, clinic_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT d.id, p.full_name, d.clinic_id FROM public.doctors d
    JOIN public.profiles p ON p.id = d.id ORDER BY p.full_name, d.id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_staff_assignments()
RETURNS TABLE(id uuid, name text, clinic_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.full_name, m.clinic_id FROM public.profiles p
    LEFT JOIN public.staff_clinic_memberships m ON m.staff_id = p.id
    WHERE p.role = 'staff' ORDER BY p.full_name, p.id;
END $$;

REVOKE ALL ON FUNCTION public.admin_clinic_directory() FROM PUBLIC, anon, service_role, schedula_production;
REVOKE ALL ON FUNCTION public.admin_doctor_assignments() FROM PUBLIC, anon, service_role, schedula_production;
REVOKE ALL ON FUNCTION public.admin_staff_assignments() FROM PUBLIC, anon, service_role, schedula_production;
GRANT EXECUTE ON FUNCTION public.admin_clinic_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_doctor_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_staff_assignments() TO authenticated;
NOTIFY pgrst, 'reload schema';
