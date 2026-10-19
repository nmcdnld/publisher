// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   BracesIcon,
   DatabaseIcon,
   FileCode2Icon,
   GitForkIcon,
   HashIcon,
   LayoutDashboardIcon,
   LockIcon,
   SigmaIcon,
   SlidersHorizontalIcon,
   TagIcon,
   ZapIcon,
   type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type { Entity, EntityKind, Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import {
   HoverCard,
   HoverCardContent,
   HoverCardTrigger,
} from "../../ui/hover-card";

export const KIND_META: Record<
   EntityKind,
   { icon: LucideIcon; label: string; plural: string; tint: string }
> = {
   source: {
      icon: DatabaseIcon,
      label: "Source",
      plural: "Sources",
      tint: "text-sky-600 dark:text-sky-400",
   },
   dimension: {
      icon: TagIcon,
      label: "Dimension",
      plural: "Dimensions",
      tint: "text-slate-500 dark:text-slate-400",
   },
   measure: {
      icon: SigmaIcon,
      label: "Measure",
      plural: "Measures",
      tint: "text-emerald-600 dark:text-emerald-400",
   },
   join: {
      icon: GitForkIcon,
      label: "Join",
      plural: "Joins",
      tint: "text-violet-600 dark:text-violet-400",
   },
   view: {
      icon: LayoutDashboardIcon,
      label: "View",
      plural: "Views",
      tint: "text-amber-600 dark:text-amber-400",
   },
   query: {
      icon: FileCode2Icon,
      label: "Query",
      plural: "Queries",
      tint: "text-pink-600 dark:text-pink-400",
   },
   given: {
      icon: SlidersHorizontalIcon,
      label: "Given",
      plural: "Givens",
      tint: "text-cyan-600 dark:text-cyan-400",
   },
};

/** The kinds a source declares, in the order the dictionary lists them. */
export const FIELD_KINDS = ["measure", "dimension", "join", "view"] as const;

/** A source's own fields, grouped by kind in `FIELD_KINDS` order. */
export function sourceFields(ontology: Ontology, source: Entity): Entity[] {
   const fields = (source.fieldIds ?? [])
      .map((id) => ontology.entities.get(id))
      .filter(Boolean) as Entity[];
   return FIELD_KINDS.flatMap((kind) => fields.filter((f) => f.kind === kind));
}

export function KindIcon({
   kind,
   className,
}: {
   kind: EntityKind;
   className?: string;
}) {
   const Icon = KIND_META[kind].icon;
   return <Icon className={cn("size-3.5", KIND_META[kind].tint, className)} />;
}

export function dictionaryHref(ontology: Ontology, id?: string): string {
   const base = `/${ontology.environmentName}/${ontology.packageName}/dictionary`;
   return id
      ? `${base}/${id
           .split("/")
           .map((s) => encodeURIComponent(s).replace(/%3A/g, ":"))
           .join("/")}`
      : base;
}

export function displayName(entity: Entity): string {
   if (entity.kind === "given") return `$${entity.name}`;
   if (entity.sourceName && entity.kind !== "source") {
      return `${entity.sourceName}.${entity.name}`;
   }
   return entity.name;
}

export function EntityChip({
   ontology,
   id,
   qualified = false,
   preview = false,
   className,
}: {
   ontology: Ontology;
   id: string;
   qualified?: boolean;
   /** Show the entity's description and key facts in a popover on hover. */
   preview?: boolean;
   className?: string;
}) {
   const entity = ontology.entities.get(id);
   if (!entity) return null;
   const chip = (
      <Link
         to={dictionaryHref(ontology, id)}
         className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono text-xs transition-colors hover:border-primary/40 hover:bg-accent",
            className,
         )}
      >
         <KindIcon kind={entity.kind} />
         <span className="truncate">
            {qualified ? displayName(entity) : entity.name}
         </span>
      </Link>
   );
   if (!preview) return chip;
   return (
      <HoverCard>
         <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
         <HoverCardContent>
            <EntityPreview ontology={ontology} entity={entity} />
         </HoverCardContent>
      </HoverCard>
   );
}

function EntityPreview({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const joinTarget = entity.joinTargetId
      ? ontology.entities.get(entity.joinTargetId)
      : undefined;
   return (
      <div className="space-y-2.5">
         <div className="flex min-w-0 items-center gap-2">
            <KindIcon kind={entity.kind} className="size-4 shrink-0" />
            <span className="min-w-0 truncate font-mono text-sm font-semibold">
               {displayName(entity)}
            </span>
            <Badge variant="secondary" className="ml-auto">
               {KIND_META[entity.kind].label}
            </Badge>
         </div>
         {(entity.dataType ||
            entity.persisted ||
            entity.authorized ||
            entity.relationship) && (
            <div className="flex flex-wrap items-center gap-1.5">
               <TypeLabel entity={entity} />
               {entity.relationship && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                     join_{entity.relationship}
                     {joinTarget && ` → ${joinTarget.name}`}
                  </span>
               )}
               {entity.persisted && (
                  <Badge variant="outline" className="gap-1">
                     <ZapIcon /> persisted
                  </Badge>
               )}
               {entity.authorized && (
                  <Badge variant="outline" className="gap-1">
                     <LockIcon /> authorize
                  </Badge>
               )}
            </div>
         )}
         {entity.label && entity.label !== entity.name && (
            <p className="text-xs text-muted-foreground">
               Shown as{" "}
               <span className="font-medium text-foreground">
                  {entity.label}
               </span>
            </p>
         )}
         <p
            className={cn(
               "line-clamp-5 text-sm leading-snug",
               !entity.doc && "italic text-muted-foreground",
            )}
         >
            {entity.doc ?? "No #(doc) description."}
         </p>
         {entity.formula && (
            <code className="line-clamp-3 block break-words rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
               {entity.formula}
            </code>
         )}
         <div className="flex items-center gap-3 border-t pt-2 text-[11px] text-muted-foreground">
            <span>Uses {entity.uses.length}</span>
            <span>Used by {entity.usedBy.length}</span>
            <span className="ml-auto">Click to open</span>
         </div>
      </div>
   );
}

export function TypeLabel({ entity }: { entity: Entity }) {
   if (!entity.dataType) return null;
   return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
         {entity.dataType === "number" ? (
            <HashIcon className="size-3" />
         ) : (
            <BracesIcon className="size-3" />
         )}
         {entity.dataType}
      </span>
   );
}

/** Backticked so a field named after a keyword still compiles. */
export function q(name: string): string {
   return `\`${name}\``;
}
