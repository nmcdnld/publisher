// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import { Button } from "@mui/material";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A slot in malloy-explorer's result header, just left of its Download CSV.
 *
 * The explorer offers no way to add a control to that header, so the slot is
 * placed beside its tab list and re-placed whenever the explorer re-renders the
 * header (it unmounts it when there is no query, and remounts it on the next).
 * The auto left margin is what keeps the slot and Download CSV together on the
 * right while the header spaces its children apart.
 */
function useResultHeaderSlot(root: HTMLElement | null): HTMLElement | null {
   const [slot, setSlot] = useState<HTMLElement | null>(null);
   useEffect(() => {
      if (!root) return;
      const host = document.createElement("span");
      Object.assign(host.style, {
         display: "inline-flex",
         alignItems: "center",
         marginLeft: "auto",
         marginRight: "8px",
      });
      const place = () => {
         const tablist = root.querySelector('[role="tablist"]');
         if (!tablist?.parentElement) return;
         if (host.previousElementSibling !== tablist) tablist.after(host);
      };
      place();
      setSlot(host);
      const observer = new MutationObserver(place);
      observer.observe(root, { childList: true, subtree: true });
      return () => {
         observer.disconnect();
         host.remove();
         setSlot(null);
      };
   }, [root]);
   return slot;
}

export function ResultHeaderPublish({
   root,
   label = "Publish",
   onPublish,
}: {
   /** The element wrapping the explorer's ResultPanel; null renders nothing. */
   root: HTMLElement | null;
   label?: string;
   /** Absent while there is no result to publish. */
   onPublish?: () => void;
}) {
   const slot = useResultHeaderSlot(root);
   if (!slot || !onPublish) return null;
   return createPortal(
      <Button
         size="small"
         startIcon={<PublishOutlinedIcon fontSize="small" />}
         onClick={onPublish}
         sx={{
            textTransform: "none",
            color: "text.primary",
            fontWeight: 400,
            whiteSpace: "nowrap",
         }}
      >
         {label}
      </Button>,
      slot,
   );
}
