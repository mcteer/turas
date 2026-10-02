"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem("turas-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
      setTheme(saved);
    }
  }, []);
  useEffect(() => {
    function toggle() {
      const next = (document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches))
        ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("turas-theme", next);
      setTheme(next);
    }
    window.addEventListener("turas-theme-toggle", toggle);
    return () => window.removeEventListener("turas-theme-toggle", toggle);
  }, []);
  return <>{children}<span hidden data-theme-value={theme ?? "system"} /></>;
}

export function ThemeToggle() {
  return <button className="theme-toggle" type="button" onClick={() =>
    window.dispatchEvent(new Event("turas-theme-toggle"))}><UiIcon name="theme" size={15} />Toggle theme</button>;
}
