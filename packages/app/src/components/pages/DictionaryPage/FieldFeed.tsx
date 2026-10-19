// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   useCallback,
   useEffect,
   useLayoutEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Entity, Ontology } from "../../../ontology/types";
import { EntityPage } from "./EntityPage";
import { dictionaryHref, sourceFields } from "./shared";

/**
 * The element that scrolls `el`. An observer rooted at the viewport cannot see
 * past a scrolling ancestor's edge, so look-ahead margins need this as root.
 */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
   for (let node = el?.parentElement; node; node = node.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
   }
   return null;
}

/**
 * Every field of one source, one page after another, opened at the selected
 * field. Scrolling selects whichever field crosses the band a quarter of the
 * way down the scroll area, so the URL and the sidebar follow the reader.
 */
export function FieldFeed({
   ontology,
   source,
   selectedId,
}: {
   ontology: Ontology;
   source: Entity;
   selectedId: string;
}) {
   const fields = useMemo(
      () => sourceFields(ontology, source),
      [ontology, source],
   );
   const navigate = useNavigate();
   const location = useLocation();
   const sections = useRef(new Map<string, HTMLElement>());
   const feed = useRef<HTMLDivElement>(null);
   const fromScroll = useRef<string>(undefined);
   const pinned = useRef(false);
   const latest = useRef({ selectedId, search: location.search });
   latest.current = { selectedId, search: location.search };

   // Pages above the target mount after the jump and change height, so hold
   // the target at the top until the layout settles or the reader scrolls.
   useLayoutEffect(() => {
      const skip = fromScroll.current === selectedId;
      fromScroll.current = undefined;
      const target = sections.current.get(selectedId);
      if (skip || !target || !feed.current) return;
      const scroller = scrollParent(feed.current);
      const align = () => target.scrollIntoView({ block: "start" });
      let timer = 0;
      const settle = () => {
         clearTimeout(timer);
         timer = window.setTimeout(release, 1000);
      };
      const resizes = new ResizeObserver(() => {
         align();
         settle();
      });
      const inputs = ["wheel", "touchstart", "keydown", "pointerdown"];
      function release() {
         pinned.current = false;
         clearTimeout(timer);
         resizes.disconnect();
         inputs.forEach((e) => scroller?.removeEventListener(e, release));
      }
      pinned.current = true;
      align();
      settle();
      resizes.observe(feed.current);
      inputs.forEach((e) =>
         scroller?.addEventListener(e, release, { passive: true }),
      );
      return release;
   }, [selectedId]);

   useEffect(() => {
      const inBand = new Set<string>();
      const observer = new IntersectionObserver(
         (entries) => {
            for (const entry of entries) {
               const id = (entry.target as HTMLElement).dataset.entityId!;
               if (entry.isIntersecting) inBand.add(id);
               else inBand.delete(id);
            }
            const id = fields.find((f) => inBand.has(f.id))?.id;
            if (!id || pinned.current || id === latest.current.selectedId)
               return;
            fromScroll.current = id;
            navigate(
               {
                  pathname: dictionaryHref(ontology, id),
                  search: latest.current.search,
               },
               { replace: true },
            );
         },
         {
            root: scrollParent(feed.current),
            rootMargin: "-25% 0px -74% 0px",
         },
      );
      sections.current.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
   }, [fields, navigate, ontology]);

   const register = useCallback((id: string, el: HTMLElement | null) => {
      if (el) sections.current.set(id, el);
      else sections.current.delete(id);
   }, []);

   return (
      <div ref={feed}>
         {fields.map((field) => (
            <FieldSection
               key={field.id}
               ontology={ontology}
               field={field}
               eager={field.id === selectedId}
               register={register}
            />
         ))}
      </div>
   );
}

/** Mounts its page once near the viewport: each page runs live queries. */
function FieldSection({
   ontology,
   field,
   eager,
   register,
}: {
   ontology: Ontology;
   field: Entity;
   eager: boolean;
   register: (id: string, el: HTMLElement | null) => void;
}) {
   const ref = useRef<HTMLElement>(null);
   const [shown, setShown] = useState(eager);
   useEffect(() => {
      if (eager) setShown(true);
   }, [eager]);

   useLayoutEffect(() => {
      register(field.id, ref.current);
      return () => register(field.id, null);
   }, [field.id, register]);

   useEffect(() => {
      if (shown || !ref.current) return;
      const observer = new IntersectionObserver(
         ([entry]) => {
            if (entry.isIntersecting) setShown(true);
         },
         { root: scrollParent(ref.current), rootMargin: "800px 0px" },
      );
      observer.observe(ref.current);
      return () => observer.disconnect();
   }, [shown]);

   return (
      <section
         ref={ref}
         data-entity-id={field.id}
         className="border-b last:min-h-[calc(100dvh-56px)] last:border-b-0"
      >
         {shown ? (
            <EntityPage ontology={ontology} entity={field} />
         ) : (
            <div className="mx-auto h-[48rem] max-w-6xl px-6 py-6">
               <h2 className="font-mono text-2xl font-semibold tracking-tight text-muted-foreground/50">
                  {field.name}
               </h2>
            </div>
         )}
      </section>
   );
}
