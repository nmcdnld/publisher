// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useSyncExternalStore } from "react";

export type Shortcut = {
   /** The in-app path the shortcut opens, which is also its identity. */
   path: string;
   title: string;
   kind: "dashboard" | "notebook";
};

const KEY = "credible-clone:saved";
const listeners = new Set<() => void>();
let cache: Shortcut[] = read();

function read(): Shortcut[] {
   try {
      const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return Array.isArray(parsed) ? (parsed as Shortcut[]) : [];
   } catch {
      return [];
   }
}

function write(next: Shortcut[]) {
   cache = next;
   localStorage.setItem(KEY, JSON.stringify(next));
   listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
   listeners.add(listener);
   const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      cache = read();
      listener();
   };
   window.addEventListener("storage", onStorage);
   return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
   };
}

/** Saved reports, newest first, persisted in localStorage and shared across tabs. */
export function useSaved() {
   const saved = useSyncExternalStore(subscribe, () => cache);
   const isSaved = useCallback(
      (path: string) => saved.some((s) => s.path === path),
      [saved],
   );
   const toggle = useCallback((shortcut: Shortcut) => {
      write(
         cache.some((s) => s.path === shortcut.path)
            ? cache.filter((s) => s.path !== shortcut.path)
            : [shortcut, ...cache],
      );
   }, []);
   return { saved, isSaved, toggle };
}
