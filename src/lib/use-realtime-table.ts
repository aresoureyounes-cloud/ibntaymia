import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Postgres changes on a table and invalidates a TanStack Query
 * cache key whenever any row is inserted/updated/deleted.
 *
 * Usage:
 *   useRealtimeTable("students", ["students"]);
 */
export function useRealtimeTable(table: string, queryKey: readonly unknown[]) {
  const qc = useQueryClient();
  useEffect(() => {
    // Unique topic per subscription instance: two components watching the same
    // table (or a StrictMode remount) must not reuse a channel that already
    // joined, otherwise supabase throws
    // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
    const topic = `realtime:${table}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        qc.invalidateQueries({ queryKey: queryKey as unknown[] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(queryKey)]);
}

