// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { usePublisherTheme } from "../../theme";
import type { ResolvedTheme } from "../../theme/types";
import {
   isPublisherThemeRequest,
   postDataAppTheme,
   type DataAppTheme,
} from "../../utils/dataAppEmbed";

/** The Publisher theme in the shape a data app receives. */
export function dataAppThemeFrom(theme: ResolvedTheme): DataAppTheme {
   const [c1, c2, c3, c4, c5] = theme.series;
   return {
      mode: theme.mode,
      tokens: {
         background: theme.dashboardRoot,
         card: theme.tile,
         foreground: theme.foreground,
         "muted-foreground": theme.tileTitle,
         border: theme.axisFaint,
         primary: c1,
         "chart-1": c1,
         "chart-2": c2,
         "chart-3": c3,
         "chart-4": c4,
         "chart-5": c5,
         "font-sans": theme.font.family,
      },
   };
}

/**
 * Keep the data app in `frameRef` drawn in the host's appearance: answer its
 * theme request when it loads, and send the theme again whenever it changes.
 * `theme` defaults to the Publisher theme in effect, so a host with a theme of
 * its own passes that instead.
 */
export function useDataAppThemeBridge(
   frameRef: RefObject<HTMLIFrameElement | null>,
   theme?: DataAppTheme,
): void {
   const { theme: publisherTheme } = usePublisherTheme();
   const fallback = useMemo(
      () => dataAppThemeFrom(publisherTheme),
      [publisherTheme],
   );
   const effective = theme ?? fallback;
   const latest = useRef(effective);
   latest.current = effective;

   useEffect(() => {
      function onMessage(e: MessageEvent) {
         if (!isPublisherThemeRequest(e.data)) return;
         if (e.source !== frameRef.current?.contentWindow) return;
         postDataAppTheme(frameRef.current, latest.current);
      }
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
   }, [frameRef]);

   useEffect(() => {
      postDataAppTheme(frameRef.current, effective);
   }, [frameRef, effective]);
}
