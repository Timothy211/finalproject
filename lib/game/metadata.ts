import "server-only";
import { cache } from "react";
import { adminConfigured, getAdminSupabase } from "@/lib/supabase/server";
import { hostName, type GameRow } from "@/lib/types";
import { timeControlLabel } from "@/lib/timeControl";

export interface InviteInfo {
  host: string;
  timeControl: string;
  boardSize: number;
  status: GameRow["status"];
  p0: string | null;
  p1: string | null;
}

/** Loads public invite info for link previews (secret key, server only). */
export const loadInvite = cache(async (code: string): Promise<InviteInfo | null> => {
  if (!adminConfigured() || !/^[A-Za-z0-9]{6}$/.test(code)) return null;
  try {
    const { data } = await getAdminSupabase()
      .from("games")
      .select("host_id,p0_id,p1_id,p0_name,p1_name,initial_time_ms,increment_ms,board_size,status")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!data) return null;
    const g = data as unknown as GameRow;
    return {
      host: hostName(g),
      timeControl: timeControlLabel(g.initial_time_ms, g.increment_ms),
      boardSize: g.board_size,
      status: g.status,
      p0: g.p0_name,
      p1: g.p1_name,
    };
  } catch {
    return null;
  }
});
