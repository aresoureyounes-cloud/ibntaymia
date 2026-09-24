import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type AuthState = {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
};

export function useAuth(): AuthState & {
  isDeveloper: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = useCallback(async (authUser: User | null | undefined) => {
    const userId = authUser?.id;
    if (!userId) {
      setRoles([]);
      return;
    }

    // Roles are assigned server-side by the handle_new_user trigger.
    // Client only reads them — never writes.
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);

    if (!error && data) {
      setRoles(data.map((r) => r.role as AppRole));
    } else {
      setRoles([]);
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setLoading(true);
        setTimeout(() => {
          loadRoles(newSession.user).finally(() => setLoading(false));
        }, 0);
      } else {
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadRoles(data.session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user) await loadRoles(session.user);
  }, [session, loadRoles]);

  const isDeveloper = roles.includes("developer");

  return {
    session,
    user: session?.user ?? null,
    roles,
    isDeveloper,
    // Developer bypasses every role gate.
    hasRole: (role: AppRole) => isDeveloper || roles.includes(role),
    loading,
    signOut,
    refresh,
  };
}
