// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
   ACCENT_COLORS,
   BUILT_IN_THEMES,
   SURFACES,
   createWorkspaceTheme,
   deleteWorkspaceTheme,
   setWorkspaceTheme,
   useAppearance,
   type AccentScale,
   type GrayScale,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

export function SurfaceSwatch({
   grayScale,
   accent,
}: {
   grayScale: GrayScale;
   accent: AccentScale;
}) {
   return (
      <span className="flex shrink-0 gap-px">
         {(["200", "400", "600", "800"] as const).map((s) => (
            <span
               key={s}
               className="size-3 rounded-[2px]"
               style={{ backgroundColor: grayScale[s] }}
            />
         ))}
         <span
            className="size-3 rounded-[2px]"
            style={{ backgroundColor: accent[500] }}
         />
      </span>
   );
}

/**
 * Lists the workspace themes with a search box that doubles as the name of a
 * new theme: typing a name no theme has offers to create it from a surface
 * and an accent.
 */
export function ThemePickerPanel() {
   const { themeId, customThemes } = useAppearance();
   const [search, setSearch] = useState("");
   const [creating, setCreating] = useState(false);

   const allThemes = useMemo(
      () => [...BUILT_IN_THEMES, ...customThemes],
      [customThemes],
   );
   const q = search.trim();
   const filtered = q
      ? allThemes.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
      : allThemes;
   const canCreate =
      q.length > 0 &&
      !allThemes.some((t) => t.name.toLowerCase() === q.toLowerCase());

   if (creating && canCreate) {
      return (
         <CreateForm
            name={q}
            onBack={() => setCreating(false)}
            onCreate={(surfaceId, accentName) => {
               createWorkspaceTheme(q, surfaceId, accentName);
               setCreating(false);
               setSearch("");
            }}
         />
      );
   }

   return (
      <>
         <div className="p-2">
            <Input
               autoFocus
               placeholder="Search or create theme…"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) setCreating(true);
               }}
               className="h-8 text-sm md:text-sm"
            />
         </div>
         <div className="max-h-72 overflow-y-auto border-t p-1">
            {filtered.map((theme) => (
               <div
                  key={theme.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setWorkspaceTheme(theme.id)}
                  onKeyDown={(e) => {
                     if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setWorkspaceTheme(theme.id);
                     }
                  }}
                  className="group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
               >
                  <SurfaceSwatch
                     grayScale={theme.grayScale}
                     accent={theme.accent}
                  />
                  <span className="flex-1 truncate">{theme.name}</span>
                  {!theme.isBuiltIn && (
                     <button
                        type="button"
                        title="Delete theme"
                        onClick={(e) => {
                           e.stopPropagation();
                           deleteWorkspaceTheme(theme.id);
                        }}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100"
                     >
                        <Trash2 className="size-3" />
                     </button>
                  )}
                  {themeId === theme.id && (
                     <Check className="size-3.5 shrink-0 text-primary" />
                  )}
               </div>
            ))}
            {canCreate && (
               <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
               >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">Create “{q}”</span>
               </button>
            )}
            {filtered.length === 0 && !canCreate && (
               <div className="px-2 py-2 text-sm text-muted-foreground">
                  No themes found
               </div>
            )}
         </div>
      </>
   );
}

function CreateForm({
   name,
   onBack,
   onCreate,
}: {
   name: string;
   onBack: () => void;
   onCreate: (surfaceId: string, accentName: string) => void;
}) {
   const [surfaceId, setSurfaceId] = useState(SURFACES[0].id);
   const [accentName, setAccentName] = useState(ACCENT_COLORS[0].name);

   return (
      <div className="flex flex-col gap-4 p-3">
         <div className="flex items-center gap-2">
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               onClick={onBack}
               aria-label="Back to themes"
            >
               <ArrowLeft className="size-3.5" />
            </Button>
            <span className="truncate text-sm font-medium">{name}</span>
         </div>

         <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Surface</span>
            <div className="flex flex-wrap gap-2">
               {SURFACES.map((s) => {
                  const selected = surfaceId === s.id;
                  return (
                     <button
                        key={s.id}
                        type="button"
                        onClick={() => setSurfaceId(s.id)}
                        className={cn(
                           "flex flex-col items-center gap-1 transition-opacity",
                           !selected && "opacity-55 hover:opacity-80",
                        )}
                     >
                        <span
                           className={cn(
                              "flex gap-px rounded-md border-2 p-0.5",
                              selected
                                 ? "border-primary"
                                 : "border-transparent",
                           )}
                        >
                           {(["200", "500", "800"] as const).map((shade) => (
                              <span
                                 key={shade}
                                 className="size-3.5 rounded-[2px]"
                                 style={{ backgroundColor: s.grayScale[shade] }}
                              />
                           ))}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                           {s.name}
                        </span>
                     </button>
                  );
               })}
            </div>
         </div>

         <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Accent</span>
            <div className="flex flex-wrap gap-1.5">
               {ACCENT_COLORS.map((a) => (
                  <button
                     key={a.name}
                     type="button"
                     title={a.name}
                     aria-label={a.name}
                     onClick={() => setAccentName(a.name)}
                     className="size-5.5 rounded-full transition-transform hover:scale-110"
                     style={{
                        backgroundColor: a[500],
                        boxShadow:
                           accentName === a.name
                              ? `0 0 0 2px var(--popover), 0 0 0 3.5px ${a[500]}`
                              : undefined,
                     }}
                  />
               ))}
            </div>
         </div>

         <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
               Cancel
            </Button>
            <Button size="sm" onClick={() => onCreate(surfaceId, accentName)}>
               Create
            </Button>
         </div>
      </div>
   );
}
