// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef } from "react";
import {
   useLocation,
   useNavigate,
   useNavigationType,
   useSearchParams,
} from "react-router-dom";

/** What the dictionary's side panel shows: the drafts being written, or their promotion. */
export type PanelState =
   | { type: "drafts"; focus?: string }
   | { type: "promote" };

const PARAM = "panel";
const FOCUS = "focus";

function parse(params: URLSearchParams): PanelState | undefined {
   const value = params.get(PARAM);
   if (!value) return undefined;
   if (value === "drafts") {
      return { type: "drafts", focus: params.get(FOCUS) ?? undefined };
   }
   if (value === "promote") return { type: "promote" };
   return undefined;
}

function write(params: URLSearchParams, panel: PanelState | undefined) {
   params.delete(PARAM);
   params.delete(FOCUS);
   if (!panel) return;
   params.set(PARAM, panel.type);
   if (panel.type === "drafts" && panel.focus) params.set(FOCUS, panel.focus);
}

/** The open panel, kept in the URL so it survives a reload and can be linked. */
export function useDictionaryPanel() {
   const [params, setParams] = useSearchParams();
   const panel = parse(params);
   const open = useCallback(
      (next: PanelState | undefined) =>
         setParams(
            (prev) => {
               const out = new URLSearchParams(prev);
               write(out, next);
               return out;
            },
            // Opening pushes, so Back closes the panel; switching and closing replace.
            { replace: !next || params.has(PARAM) },
         ),
      [params, setParams],
   );
   const close = useCallback(() => open(undefined), [open]);
   return { panel, open, close };
}

/**
 * Keep the panel open across a move to another dictionary page. Links inside the
 * dictionary name a path, not the panel, so carry the panel onto the new page.
 */
export function useKeepPanelAcrossPages() {
   const location = useLocation();
   const navigationType = useNavigationType();
   const navigate = useNavigate();
   const last = useRef<{ pathname: string; params: URLSearchParams }>(
      undefined,
   );
   useEffect(() => {
      const params = new URLSearchParams(location.search);
      const before = last.current;
      if (
         before &&
         before.pathname !== location.pathname &&
         navigationType === "PUSH" &&
         !params.has(PARAM) &&
         before.params.has(PARAM)
      ) {
         write(params, parse(before.params));
         navigate(
            { pathname: location.pathname, search: params.toString() },
            { replace: true },
         );
         return;
      }
      last.current = { pathname: location.pathname, params };
   }, [location, navigationType, navigate]);
}
