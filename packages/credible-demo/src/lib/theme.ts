// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { DataAppTheme, DataAppThemeToken } from "@malloy-publisher/sdk";
import { useMemo, useSyncExternalStore } from "react";
import { workspaceKey } from "./workspaces";

/*
 * Appearance has two independent axes, both persisted in localStorage:
 *
 * - Mode: "system" follows the OS light/dark setting, "light"/"dark" override
 *   it. It toggles the `.dark` class on <html>.
 * - Workspace theme: a surface gray ramp plus an accent scale. Every shadcn
 *   token in index.css is re-derived from those two scales, for light and
 *   dark alike, and written to a <style> element, so every utility class
 *   (`bg-muted`, `text-primary`, `bg-chart-2/15`, ...) follows the theme.
 *   The default Credible theme writes nothing and keeps the hand-tuned
 *   tokens in index.css. The chosen theme is per workspace; custom themes
 *   are shared by all of them.
 */

const STORAGE_MODE = "destination.theme";
export const STORAGE_THEME_ID = "destination.workspace-theme";
const themeIdKey = () => workspaceKey(STORAGE_THEME_ID);
const STORAGE_CUSTOM_THEMES = "destination.workspace-custom-themes";
const STYLE_EL_ID = "destination-workspace-theme";

export type ThemeMode = "light" | "dark";
export type ModePref = "system" | ThemeMode;

export const GRAY_SHADES = [
   "50",
   "100",
   "200",
   "300",
   "400",
   "500",
   "600",
   "700",
   "800",
   "900",
   "950",
] as const;

export type GrayShade = (typeof GRAY_SHADES)[number];
export type GrayScale = Record<GrayShade, string>;

export interface AccentScale {
   name: string;
   400: string;
   500: string;
   600: string;
   700: string;
}

export interface SurfaceFamily {
   id: string;
   name: string;
   grayScale: GrayScale;
   bgLight: string;
   bgDark: string;
}

export interface WorkspaceTheme extends Omit<SurfaceFamily, "id" | "name"> {
   id: string;
   name: string;
   accent: AccentScale;
   isBuiltIn: boolean;
}

// ── Accent palettes ────────────────────────────────────────────────────

const CREDIBLE_ACCENT: AccentScale = {
   name: "Credible",
   400: "#5684da",
   500: "#3263c3",
   600: "#1e4eac",
   700: "#133c8b",
};

export const ACCENT_COLORS: AccentScale[] = [
   CREDIBLE_ACCENT,
   {
      name: "Blue",
      400: "#60A5FA",
      500: "#3B82F6",
      600: "#2563EB",
      700: "#1D4ED8",
   },
   {
      name: "Indigo",
      400: "#818CF8",
      500: "#6366F1",
      600: "#4F46E5",
      700: "#4338CA",
   },
   {
      name: "Violet",
      400: "#A78BFA",
      500: "#8B5CF6",
      600: "#7C3AED",
      700: "#6D28D9",
   },
   {
      name: "Teal",
      400: "#2DD4BF",
      500: "#14B8A6",
      600: "#0D9488",
      700: "#0F766E",
   },
   {
      name: "Emerald",
      400: "#34D399",
      500: "#10B981",
      600: "#059669",
      700: "#047857",
   },
   {
      name: "Orange",
      400: "#FB923C",
      500: "#F97316",
      600: "#EA580C",
      700: "#C2410C",
   },
   {
      name: "Rose",
      400: "#FB7185",
      500: "#F43F5E",
      600: "#E11D48",
      700: "#BE123C",
   },
   {
      name: "Amber",
      400: "#FBBF24",
      500: "#F59E0B",
      600: "#D97706",
      700: "#B45309",
   },
];

const accentByName = (name: string) =>
   ACCENT_COLORS.find((a) => a.name === name) ?? CREDIBLE_ACCENT;

// ── Surface ramps ──────────────────────────────────────────────────────

export const SURFACES: SurfaceFamily[] = [
   {
      id: "neutral",
      name: "Neutral",
      bgLight: "#fbfcfd",
      bgDark: "#0f1116",
      grayScale: {
         50: "#f5f7f9",
         100: "#eff2f6",
         200: "#e1e3e7",
         300: "#caced4",
         400: "#999fa8",
         500: "#646972",
         600: "#484d55",
         700: "#2f3339",
         800: "#212429",
         900: "#13161b",
         950: "#0b0d12",
      },
   },
   {
      id: "sky",
      name: "Sky",
      bgLight: "#F5F7FC",
      bgDark: "#1B2639",
      grayScale: {
         50: "#F0F3FA",
         100: "#E1E6F3",
         200: "#C6CEE0",
         300: "#A5B0C8",
         400: "#7D8CAA",
         500: "#6A7A9B",
         600: "#59698A",
         700: "#495977",
         800: "#3A4964",
         900: "#2D3A52",
         950: "#233045",
      },
   },
   {
      id: "sand",
      name: "Sand",
      bgLight: "#FDFBF7",
      bgDark: "#1C160E",
      grayScale: {
         50: "#FFFDF9",
         100: "#F9F0E4",
         200: "#E3D0B7",
         300: "#C4A884",
         400: "#9D7F54",
         500: "#876B45",
         600: "#6F5738",
         700: "#57442C",
         800: "#403221",
         900: "#2A2116",
         950: "#1C160E",
      },
   },
   {
      id: "sage",
      name: "Sage",
      bgLight: "#F3FAF6",
      bgDark: "#1C322C",
      grayScale: {
         50: "#EEF7F3",
         100: "#DCECE6",
         200: "#B8D1CA",
         300: "#93B3A8",
         400: "#699183",
         500: "#578172",
         600: "#487062",
         700: "#3B5E53",
         800: "#2F4D44",
         900: "#243D37",
         950: "#1C322C",
      },
   },
   {
      id: "rose",
      name: "Rose",
      bgLight: "#FDF5F6",
      bgDark: "#261E20",
      grayScale: {
         50: "#FDF5F6",
         100: "#F8E8EA",
         200: "#EDCDD2",
         300: "#D6AEB5",
         400: "#B38891",
         500: "#997078",
         600: "#805B63",
         700: "#664950",
         800: "#4E383E",
         900: "#392A2F",
         950: "#2B2024",
      },
   },
   {
      id: "lavender",
      name: "Lavender",
      bgLight: "#F8F5FB",
      bgDark: "#221D28",
      grayScale: {
         50: "#F9F5FC",
         100: "#F0E8F5",
         200: "#DDD0E8",
         300: "#C3AFD6",
         400: "#A388BE",
         500: "#8A6FA8",
         600: "#735B90",
         700: "#5E4976",
         800: "#49395C",
         900: "#362B46",
         950: "#271F33",
      },
   },
   {
      id: "oxide",
      name: "Oxide",
      bgLight: "#FCF6F1",
      bgDark: "#211A13",
      grayScale: {
         50: "#FCF6F1",
         100: "#F5E8DB",
         200: "#E5CCAF",
         300: "#CDA97E",
         400: "#AA8258",
         500: "#916C47",
         600: "#775739",
         700: "#5E442D",
         800: "#473322",
         900: "#32251A",
         950: "#231A12",
      },
   },
];

// ── Built-in themes ────────────────────────────────────────────────────

function builtIn(
   surfaceIndex: number,
   id: string,
   name: string,
   accent: AccentScale,
): WorkspaceTheme {
   const { id: _id, name: _name, ...surface } = SURFACES[surfaceIndex];
   return { ...surface, id, name, accent, isBuiltIn: true };
}

export const BUILT_IN_THEMES: WorkspaceTheme[] = [
   builtIn(0, "credible", "Credible", CREDIBLE_ACCENT),
   builtIn(1, "sky", "Sky", accentByName("Blue")),
   builtIn(2, "sand", "Sand", accentByName("Amber")),
   builtIn(3, "sage", "Sage", accentByName("Emerald")),
   builtIn(4, "rose", "Rose", accentByName("Rose")),
   builtIn(5, "lavender", "Lavender", accentByName("Violet")),
   builtIn(6, "oxide", "Oxide", accentByName("Orange")),
];

export const DEFAULT_THEME = BUILT_IN_THEMES[0];

// ── Chart palette ──────────────────────────────────────────────────────

function hexHue(hex: string): number | null {
   const m = hex.replace("#", "").trim();
   const v =
      m.length === 3
         ? m
              .split("")
              .map((c) => c + c)
              .join("")
         : m;
   if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
   const n = parseInt(v, 16);
   const r = ((n >> 16) & 0xff) / 255;
   const g = ((n >> 8) & 0xff) / 255;
   const b = (n & 0xff) / 255;
   const max = Math.max(r, g, b);
   const d = max - Math.min(r, g, b);
   if (d === 0) return null;
   let h: number;
   if (max === r) h = ((g - b) / d) % 6;
   else if (max === g) h = (b - r) / d + 2;
   else h = (r - g) / d + 4;
   return (h * 60 + 360) % 360;
}

/**
 * The five chart series colors from index.css, with a representative hex per
 * slot used only to measure hue. Themes keep these colors and only change
 * their order.
 */
const CHART_BASE = [
   {
      hex: "#366bd3",
      light: "oklch(0.55 0.17 262)",
      dark: "oklch(0.7 0.14 262)",
   },
   {
      hex: "#00a9a2",
      light: "oklch(0.65 0.14 190)",
      dark: "oklch(0.7 0.12 190)",
   },
   {
      hex: "#da950b",
      light: "oklch(0.72 0.15 75)",
      dark: "oklch(0.78 0.14 75)",
   },
   {
      hex: "#bf56b9",
      light: "oklch(0.62 0.18 330)",
      dark: "oklch(0.7 0.16 330)",
   },
   {
      hex: "#47944c",
      light: "oklch(0.6 0.13 145)",
      dark: "oklch(0.7 0.13 145)",
   },
];

const hueDistance = (a: number, b: number) => {
   const d = Math.abs(a - b) % 360;
   return Math.min(d, 360 - d);
};

/**
 * Rotates the chart palette so the series color nearest the accent's hue
 * leads, keeping the adjacency the base ordering was designed around.
 */
export function chartPalette(
   accentHex: string,
   mode: ThemeMode,
   /** "hex" for renderers that can't read oklch(), like Vega. */
   format: "css" | "hex" = "css",
): string[] {
   const key = hexHue(accentHex);
   let lead = 0;
   if (key !== null) {
      let best = Infinity;
      CHART_BASE.forEach((c, i) => {
         const d = hueDistance(key, hexHue(c.hex)!);
         if (d < best) {
            best = d;
            lead = i;
         }
      });
   }
   const rotated = [...CHART_BASE.slice(lead), ...CHART_BASE.slice(0, lead)];
   return rotated.map((c) => (format === "hex" ? c.hex : c[mode]));
}

// ── Token derivation ───────────────────────────────────────────────────

const mix = (a: string, b: string, pct: number) =>
   `color-mix(in oklab, ${a}, ${b} ${pct}%)`;

function themeTokens(theme: WorkspaceTheme, mode: ThemeMode) {
   const g = theme.grayScale;
   const a = theme.accent;
   const charts = chartPalette(a[500], mode);
   const chartTokens = Object.fromEntries(
      charts.map((c, i) => [`chart-${i + 1}`, c]),
   );

   if (mode === "light") {
      return {
         background: theme.bgLight,
         foreground: g[950],
         card: "#ffffff",
         "card-foreground": g[950],
         popover: "#ffffff",
         "popover-foreground": g[950],
         primary: a[600],
         "primary-foreground": "#ffffff",
         secondary: g[100],
         "secondary-foreground": g[800],
         muted: g[100],
         "muted-foreground": g[500],
         accent: mix("#ffffff", a[400], 10),
         "accent-foreground": a[700],
         border: g[200],
         input: g[200],
         ring: a[400],
         sidebar: g[50],
         "sidebar-foreground": g[950],
         "sidebar-primary": a[600],
         "sidebar-primary-foreground": "#ffffff",
         "sidebar-accent": mix(g[100], a[400], 8),
         "sidebar-accent-foreground": g[900],
         "sidebar-border": g[200],
         "sidebar-ring": a[400],
         ...chartTokens,
      };
   }

   // Ramps differ in how dark their low end is, so dark surfaces are built
   // by lifting the theme's dark background toward a mid-tone of its ramp.
   const lift = (pct: number) => mix(theme.bgDark, g[400], pct);
   return {
      background: theme.bgDark,
      foreground: g[50],
      card: lift(7),
      "card-foreground": g[50],
      popover: lift(9),
      "popover-foreground": g[50],
      primary: a[400],
      "primary-foreground": theme.bgDark,
      secondary: lift(16),
      "secondary-foreground": g[50],
      muted: lift(16),
      "muted-foreground": mix(g[300], g[400], 50),
      accent: mix(theme.bgDark, a[500], 22),
      "accent-foreground": g[50],
      border: lift(18),
      input: lift(24),
      ring: a[500],
      sidebar: lift(4),
      "sidebar-foreground": g[50],
      "sidebar-primary": a[400],
      "sidebar-primary-foreground": theme.bgDark,
      "sidebar-accent": mix(lift(14), a[500], 10),
      "sidebar-accent-foreground": g[50],
      "sidebar-border": lift(18),
      "sidebar-ring": a[500],
      ...chartTokens,
   };
}

function cssBlock(selector: string, tokens: Record<string, string>) {
   const body = Object.entries(tokens)
      .map(([k, v]) => `   --${k}: ${v};`)
      .join("\n");
   return `${selector} {\n${body}\n}`;
}

/** Stylesheet for a theme; empty for the default, which index.css owns. */
export function themeCss(theme: WorkspaceTheme): string {
   if (theme.id === DEFAULT_THEME.id) return "";
   // Doubled selectors outrank index.css's :root and .dark regardless of
   // stylesheet order.
   return [
      cssBlock(":root:root", themeTokens(theme, "light")),
      cssBlock(":root.dark", themeTokens(theme, "dark")),
   ].join("\n");
}

// ── Store ──────────────────────────────────────────────────────────────

export interface AppearanceState {
   modePref: ModePref;
   mode: ThemeMode;
   themeId: string;
   customThemes: WorkspaceTheme[];
   theme: WorkspaceTheme;
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function systemMode(): ThemeMode {
   return window.matchMedia?.(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function readModePref(): ModePref {
   const v = localStorage.getItem(STORAGE_MODE);
   return v === "light" || v === "dark" ? v : "system";
}

function readCustomThemes(): WorkspaceTheme[] {
   try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_THEMES);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      return [];
   }
}

function resolve(
   modePref: ModePref,
   themeId: string,
   customThemes: WorkspaceTheme[],
): AppearanceState {
   const theme =
      BUILT_IN_THEMES.find((t) => t.id === themeId) ??
      customThemes.find((t) => t.id === themeId) ??
      DEFAULT_THEME;
   return {
      modePref,
      mode: modePref === "system" ? systemMode() : modePref,
      themeId: theme.id,
      customThemes,
      theme,
   };
}

let state: AppearanceState | null = null;
const listeners = new Set<() => void>();

function current(): AppearanceState {
   state ??= resolve(
      readModePref(),
      localStorage.getItem(themeIdKey()) ?? DEFAULT_THEME.id,
      readCustomThemes(),
   );
   return state;
}

function apply(s: AppearanceState) {
   const root = document.documentElement;
   root.classList.toggle("dark", s.mode === "dark");
   root.style.colorScheme = s.mode;
   let el = document.getElementById(STYLE_EL_ID) as HTMLStyleElement | null;
   if (!el) {
      el = document.createElement("style");
      el.id = STYLE_EL_ID;
      document.head.appendChild(el);
   }
   el.textContent = themeCss(s.theme);
}

function commit(next: AppearanceState) {
   state = next;
   apply(next);
   for (const l of listeners) l();
}

export function setModePref(pref: ModePref) {
   const s = current();
   localStorage.setItem(STORAGE_MODE, pref);
   commit(resolve(pref, s.themeId, s.customThemes));
}

export function setWorkspaceTheme(id: string) {
   const s = current();
   localStorage.setItem(themeIdKey(), id);
   commit(resolve(s.modePref, id, s.customThemes));
}

export function createWorkspaceTheme(
   name: string,
   surfaceId: string,
   accentName: string,
): WorkspaceTheme {
   const {
      id: _id,
      name: _name,
      ...surface
   } = SURFACES.find((x) => x.id === surfaceId) ?? SURFACES[0];
   const slug = name.toLowerCase().replace(/\s+/g, "-");
   const theme: WorkspaceTheme = {
      ...surface,
      id: `custom-${slug}-${Date.now()}`,
      name,
      accent: accentByName(accentName),
      isBuiltIn: false,
   };
   const s = current();
   const customThemes = [...s.customThemes, theme];
   localStorage.setItem(STORAGE_CUSTOM_THEMES, JSON.stringify(customThemes));
   localStorage.setItem(themeIdKey(), theme.id);
   commit(resolve(s.modePref, theme.id, customThemes));
   return theme;
}

export function deleteWorkspaceTheme(id: string) {
   const s = current();
   const customThemes = s.customThemes.filter((t) => t.id !== id);
   localStorage.setItem(STORAGE_CUSTOM_THEMES, JSON.stringify(customThemes));
   commit(resolve(s.modePref, s.themeId, customThemes));
}

function subscribe(listener: () => void) {
   listeners.add(listener);
   return () => listeners.delete(listener);
}

export function useAppearance(): AppearanceState {
   return useSyncExternalStore(subscribe, current);
}

const DATA_APP_TOKENS: DataAppThemeToken[] = [
   "background",
   "foreground",
   "card",
   "muted",
   "muted-foreground",
   "border",
   "ring",
   "primary",
   "primary-foreground",
   "accent",
   "accent-foreground",
   "positive",
   "negative",
   "chart-1",
   "chart-2",
   "chart-3",
   "chart-4",
   "chart-5",
];

const DATA_APP_FONT = "ui-sans-serif, system-ui, sans-serif";

/**
 * The workspace's appearance as an embedded data app receives it. Read off
 * the document rather than derived from the theme, because the default theme's
 * tokens live in index.css, not in {@link themeTokens}.
 */
export function useDataAppTheme(): DataAppTheme {
   const { mode, theme } = useAppearance();
   return useMemo(() => {
      const style = getComputedStyle(document.documentElement);
      const tokens: DataAppTheme["tokens"] = { "font-sans": DATA_APP_FONT };
      for (const name of DATA_APP_TOKENS) {
         const value = style.getPropertyValue(`--${name}`).trim();
         if (value) tokens[name] = value;
      }
      return { mode, tokens };
      // `theme` stands in for the stylesheet apply() just wrote.
   }, [mode, theme]);
}

/** Applies the persisted appearance. Call once, before the first render. */
export function initAppearance() {
   apply(current());
   window.matchMedia?.(COLOR_SCHEME_QUERY).addEventListener("change", () => {
      const s = current();
      if (s.modePref === "system") {
         commit(resolve("system", s.themeId, s.customThemes));
      }
   });
}
