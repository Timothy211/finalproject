"use client";

import { useEffect } from "react";
import { ToastProvider } from "./Toast";
import { applyTheme, readSetting } from "@/lib/settings";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(readSetting("theme"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return <ToastProvider>{children}</ToastProvider>;
}
