"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "./client";

let pending: Promise<Session> | null = null;

/** Returns the current session, signing in anonymously on first visit. */
export function ensureSession(): Promise<Session> {
  if (pending) return pending;
  pending = (async () => {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session;
    const { data: signIn, error } = await sb.auth.signInAnonymously();
    if (error || !signIn.session) {
      pending = null;
      throw error ?? new Error("NOT_AUTHENTICATED");
    }
    return signIn.session;
  })();
  return pending;
}

/** Fresh access token for API calls (refreshes if needed). */
export async function accessToken(): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  return (await ensureSession()).access_token;
}

export type AuthState =
  | { status: "loading" }
  | { status: "ready"; userId: string }
  | { status: "error"; message: string }
  | { status: "unconfigured" };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    typeof window !== "undefined" && !supabaseConfigured() ? { status: "unconfigured" } : { status: "loading" },
  );

  useEffect(() => {
    if (!supabaseConfigured()) return;
    let alive = true;
    ensureSession()
      .then((s) => alive && setState({ status: "ready", userId: s.user.id }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (alive)
          setState({
            status: "error",
            message: /anonymous/i.test(msg)
              ? "Anonymous sign-ins are disabled for this Supabase project. Enable them under Authentication → Sign In / Providers."
              : `Couldn't sign in: ${msg}`,
          });
      });
    const { data } = getSupabase().auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      if (session) setState({ status: "ready", userId: session.user.id });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
