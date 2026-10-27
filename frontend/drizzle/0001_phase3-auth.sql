ALTER TABLE "doctors" ALTER COLUMN "specialty" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "clinic_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "experience_years" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "biography" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "timezone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "date_of_birth" SET NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role public.user_role;
BEGIN
  requested_role := (NEW.raw_user_meta_data ->> 'role')::public.user_role;
  IF requested_role IS NULL OR COALESCE(trim(NEW.raw_user_meta_data ->> 'full_name'), '') = '' THEN
    RAISE EXCEPTION 'A full name and valid role are required';
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, trim(NEW.raw_user_meta_data ->> 'full_name'), requested_role);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS patients_set_updated_at ON public.patients;
CREATE TRIGGER patients_set_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS doctors_set_updated_at ON public.doctors;
CREATE TRIGGER doctors_set_updated_at BEFORE UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Profile roles cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS profiles_role_immutable ON public.profiles;
CREATE TRIGGER profiles_role_immutable BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_change();
--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY patients_select_own ON public.patients FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY patients_insert_own ON public.patients FOR INSERT TO authenticated WITH CHECK (id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient'));
CREATE POLICY patients_update_own ON public.patients FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient'));
--> statement-breakpoint
CREATE POLICY doctors_select_own ON public.doctors FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY doctors_insert_own ON public.doctors FOR INSERT TO authenticated WITH CHECK (id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor'));
CREATE POLICY doctors_update_own ON public.doctors FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor'));
