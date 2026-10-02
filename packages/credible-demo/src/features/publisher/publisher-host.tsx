// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import "@malloy-publisher/sdk/styles.css";
import {
   PublishProvider,
   ServerProvider,
   usePublisherTheme,
   type PublishContextValue,
   type Theme,
} from "@malloy-publisher/sdk";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { draftFromRequest, draftRoute } from "@/data/handoff";
import { chartPalette, useAppearance } from "@/lib/theme";

const FONT = "ui-sans-serif, system-ui, sans-serif";

/**
 * Everything Publisher's own views need to render inside this app: a server
 * to talk to (same-origin, through the dev proxy), a MUI theme in this app's
 * accent, and charts in this app's palette and light or dark mode. Publish
 * inside an embedded view goes straight to this app's review page.
 */
export function PublisherHost({ children }: { children: React.ReactNode }) {
   const { mode, theme } = useAppearance();
   const navigate = useNavigate();

   const sdkTheme = useMemo<Theme>(
      () => ({
         palette: {
            series: chartPalette(theme.accent[500], mode, "hex"),
            background: { light: theme.bgLight, dark: theme.bgDark },
         },
         font: { family: FONT },
      }),
      [theme, mode],
   );

   const muiTheme = useMemo(
      () =>
         createTheme({
            palette: {
               mode,
               primary: {
                  main: mode === "dark" ? theme.accent[400] : theme.accent[600],
               },
               background: {
                  default: mode === "dark" ? theme.bgDark : theme.bgLight,
                  paper: mode === "dark" ? theme.bgDark : "#ffffff",
               },
            },
            typography: { fontFamily: FONT },
            shape: { borderRadius: 8 },
         }),
      [theme, mode],
   );

   const publish = useMemo<PublishContextValue>(
      () => ({
         label: "Publish",
         publish: (request) => navigate(draftRoute(draftFromRequest(request))),
      }),
      [navigate],
   );

   return (
      <ServerProvider
         baseURL={import.meta.env.VITE_PUBLISHER_API}
         theme={sdkTheme}
      >
         <ModeSync mode={mode} />
         <ThemeProvider theme={muiTheme}>
            <PublishProvider value={publish}>{children}</PublishProvider>
         </ThemeProvider>
      </ServerProvider>
   );
}

/** Publisher's views follow this app's light/dark switch, not their own. */
function ModeSync({ mode }: { mode: "light" | "dark" }) {
   const { setMode, userChoice } = usePublisherTheme();
   useEffect(() => {
      if (userChoice !== mode) setMode(mode);
   }, [mode, setMode, userChoice]);
   return null;
}
