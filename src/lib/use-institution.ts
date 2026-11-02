import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export function useInstitution() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["institution-settings", user?.id],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("institution_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw new Error("تعذر قراءة بيانات المؤسسة");
      return data;
    },
  });
}