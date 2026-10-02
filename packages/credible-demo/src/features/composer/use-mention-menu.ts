// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from "react";
import { entityKindOrder, rankEntities } from "@/data/entities";
import type { EntityKind, EntityRef } from "@/data/types";

const PER_GROUP = 4;
const MAX_RESULTS = 40;

/**
 * What the menu shows for a query: with nothing typed, a few of each kind
 * under its heading; once typed, everything that matches, best first.
 */
function useMenuItems(
   entities: EntityRef[],
   query: string,
   kind: EntityKind | null,
) {
   return useMemo(() => {
      const pool = kind ? entities.filter((e) => e.kind === kind) : entities;
      if (query || kind) {
         const items = rankEntities(pool, query).slice(0, MAX_RESULTS);
         return { items, grouped: false };
      }
      const items = entityKindOrder.flatMap((k) =>
         pool.filter((e) => e.kind === k).slice(0, PER_GROUP),
      );
      return { items, grouped: true };
   }, [entities, query, kind]);
}

export interface MentionState {
   /** Where the `@` is in the text. */
   start: number;
   query: string;
   /** Where to anchor the menu, relative to the composer. */
   anchor: { top: number; left: number; height: number };
}

/** The `@` menu's selection state and the keys the textarea hands it. */
export function useMentionMenu({
   mention,
   entities,
   onSelect,
   onClose,
}: {
   mention: MentionState | null;
   entities: EntityRef[];
   onSelect: (entity: EntityRef) => void;
   onClose: () => void;
}) {
   const [kind, setKind] = useState<EntityKind | null>(null);
   const [active, setActive] = useState(0);
   const { items, grouped } = useMenuItems(
      entities,
      mention?.query ?? "",
      kind,
   );
   const open = mention !== null;

   useEffect(() => setActive(0), [mention?.query, kind]);
   useEffect(() => {
      if (!open) setKind(null);
   }, [open]);

   const kinds = useMemo(
      () => entityKindOrder.filter((k) => entities.some((e) => e.kind === k)),
      [entities],
   );

   /** True when the menu used the key, so the textarea should not. */
   const onKeyDown = (e: React.KeyboardEvent): boolean => {
      if (!open) return false;
      const move = (by: number) => {
         e.preventDefault();
         if (items.length)
            setActive((i) => (i + by + items.length) % items.length);
      };
      switch (e.key) {
         case "ArrowDown":
            move(1);
            return true;
         case "ArrowUp":
            move(-1);
            return true;
         case "Enter":
         case "Tab":
            if (!items[active]) return false;
            e.preventDefault();
            onSelect(items[active]);
            return true;
         case "Escape":
            e.preventDefault();
            onClose();
            return true;
      }
      return false;
   };

   return {
      open,
      items,
      grouped,
      active,
      setActive,
      kind,
      setKind,
      kinds,
      onKeyDown,
   };
}
