import { useEffect, useState } from "react";

/**
 * "Simple look" — a presentation-only mode that makes the app look like a
 * small, basic personal project: plain styling and only the core pages in the
 * menu. Nothing is disabled or deleted; it is stored per device.
 */
const KEY = "idaroom:simple-mode";
const EVT = "idaroom:simple-mode-change";

export const SIMPLE_MODE_PAGES = new Set([
  "/dashboard",
  "/dashboard/students",
  "/dashboard/attendance",
  "/dashboard/today",
  "/dashboard/my-attendance",
  "/dashboard/settings",
]);

export function readSimpleMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

function apply(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("simple-mode", on);
}

export function setSimpleMode(on: boolean) {
  window.localStorage.setItem(KEY, on ? "1" : "0");
  apply(on);
  window.dispatchEvent(new Event(EVT));
}

export function useSimpleMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => {
      const v = readSimpleMode();
      setOn(v);
      apply(v);
    };
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return on;
}
