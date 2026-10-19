// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from "react";
import type { ThemeMode } from "@malloy-publisher/sdk";

const ACCENT_KEY = "credible-clone:accent";

/** The workspace's key color: the logo's brand dot and MUI's `primary`. */
export const accents = {
   blue: { label: "Blue", light: "#0084ff", dark: "#3b9dff" },
   green: {
      label: "Green",
      light: "rgb(127, 152, 98)",
      dark: "rgb(155, 179, 128)",
   },
} satisfies Record<string, { label: string } & Record<ThemeMode, string>>;

export type AccentName = keyof typeof accents;

const listeners = new Set<() => void>();

function read(): AccentName {
   const stored = localStorage.getItem(ACCENT_KEY);
   return stored && stored in accents ? (stored as AccentName) : "blue";
}

export function setAccent(name: AccentName) {
   localStorage.setItem(ACCENT_KEY, name);
   listeners.forEach((l) => l());
}

export function useAccent(): AccentName {
   return useSyncExternalStore((onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
   }, read);
}
