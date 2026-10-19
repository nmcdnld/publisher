// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import "@malloy-publisher/sdk/styles.css";
import "@malloydata/malloy-explorer/styles.css";
import {
   ServerProvider,
   usePublisherTheme,
   type Theme,
   type ThemeMode,
} from "@malloy-publisher/sdk";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { accents, useAccent } from "../accent";

const FONT = `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

// Must match `--color-surface`, `--color-ink`, `--color-muted`, `--color-line`
// and `--color-panel` in index.css, per mode. Dark is the SDK's own slate ground, so
// the page and the dashboards and charts embedded in it are one surface.
const SURFACE = { light: "#ffffff", dark: "#0f172a" };
const INK = { light: "#1f1f1f", dark: "#f1f5f9" };
const MUTED = { light: "#6b6b6b", dark: "#94a3b8" };
const LINE = { light: "#e7e5e2", dark: "#334155" };
const PANEL = { light: "#faf9f7", dark: "#162036" };

const SDK_THEME: Theme = { font: { family: FONT } };

function createMuiTheme(mode: ThemeMode, accent: string) {
   return createTheme({
      palette: {
         mode,
         // The workspace accent, also the logo's brand dot. MUI paints sliders,
         // focus rings and selected states in `primary`, which as ink drew them
         // black on the light ground.
         primary: {
            main: accent,
            contrastText: "#ffffff",
         },
         background: { default: SURFACE[mode], paper: SURFACE[mode] },
         text: { primary: INK[mode], secondary: MUTED[mode] },
         divider: LINE[mode],
      },
      typography: { fontFamily: FONT },
      shape: { borderRadius: 6 },
      components: {
         // Dark mode otherwise lightens paper with a white overlay scaled by
         // elevation, so a dialog came out a grey no token names.
         MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
         MuiDialog: {
            styleOverrides: { paper: { backgroundColor: PANEL[mode] } },
         },
         // Shadows don't show on the dark ground, so floating lists get an edge.
         MuiPopover: {
            styleOverrides: {
               paper: {
                  backgroundColor: PANEL[mode],
                  border: `1px solid ${LINE[mode]}`,
               },
            },
         },
         MuiAutocomplete: {
            styleOverrides: {
               paper: {
                  backgroundColor: PANEL[mode],
                  border: `1px solid ${LINE[mode]}`,
               },
            },
         },
      },
   });
}

/**
 * What Publisher's own views need to render here: a server to talk to (the
 * dev proxy, same-origin) and a MUI theme. Light/dark is the SDK's mode, so
 * the clone's chrome, the MUI views, charts, and data-app iframes all switch
 * together.
 */
export function PublisherHost({ children }: { children: ReactNode }) {
   return (
      <ServerProvider theme={SDK_THEME}>
         <ModeThemes>{children}</ModeThemes>
      </ServerProvider>
   );
}

function ModeThemes({ children }: { children: ReactNode }) {
   const { mode } = usePublisherTheme();
   const accent = accents[useAccent()][mode];
   const muiTheme = useMemo(() => createMuiTheme(mode, accent), [mode, accent]);

   useLayoutEffect(() => {
      const root = document.documentElement;
      root.classList.toggle("dark", mode === "dark");
      root.style.colorScheme = mode;
      root.style.setProperty("--mui-palette-brand-dot", accent);
   }, [mode, accent]);

   return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>;
}
