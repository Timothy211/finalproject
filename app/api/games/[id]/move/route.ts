import { NextResponse } from "next/server";
import { getAdminSupabase, adminConfigured } from "@/lib/supabase/server";
import { parseBody, prepareMove, statusForCode } from "@/lib/game/serverMove";
import { errorCodeOf } from "@/lib/errors";
import { normalizeRowServer } from "@/lib/game/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!adminConfigured()) return err(500, "SERVER_ERROR", { detail: "Server is missing Supabase env vars" });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return err(404, "GAME_NOT_FOUND");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return err(401, "NOT_AUTHENTICATED");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err(400, "BAD_REQUEST");
  }
  const body = parseBody(raw);
  if (!body) return err(400, "BAD_REQUEST");

  const sb = getAdminSupabase();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) return err(401, "NOT_AUTHENTICATED");
  const userId = userData.user.id;

  const { data: row, error: loadErr } = await sb.from("games").select("*").eq("id", id).maybeSingle();
  if (loadErr) return err(500, "SERVER_ERROR");
  if (!row) return err(404, "GAME_NOT_FOUND");
  const game = normalizeRowServer(row);

  const prep = prepareMove(game, userId, body, Date.now());
  if (!prep.ok) return err(prep.status, prep.code, { reason: prep.reason, game });

  const { data: committed, error: rpcErr } = await sb.rpc("commit_move", prep.args);
  if (rpcErr) {
    const code = errorCodeOf(rpcErr);
    const { data: fresh } = await sb.from("games").select("*").eq("id", id).maybeSingle();
    return err(statusForCode(code), code === "UNKNOWN" ? "SERVER_ERROR" : code, { game: fresh ? normalizeRowServer(fresh) : game });
  }
  const result = normalizeRowServer(Array.isArray(committed) ? committed[0] : committed);

  // The mover flagged before the move landed: the DB finished the game on time and discarded the move.
  if (result.end_reason === "timeout") return err(409, "FLAGGED", { game: result });

  return NextResponse.json({ game: result }, { headers: { "Cache-Control": "no-store" } });
}
