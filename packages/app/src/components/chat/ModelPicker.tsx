// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { type ModelInfo, useModels } from "../../ai/consoleAi";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/** OpenRouter models that can call tools: a short list, and search over all. */
export function ModelPicker({
   value,
   onChange,
   disabled,
}: {
   value?: string;
   onChange: (id: string) => void;
   disabled?: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [search, setSearch] = useState("");
   const models = useModels();
   const list = models.data;

   const current = useMemo(
      () =>
         list?.featured.find((m) => m.id === value) ??
         list?.all.find((m) => m.id === value),
      [list, value],
   );
   const shown = useMemo(() => {
      if (!list) return [];
      const q = search.trim().toLowerCase();
      if (!q) return list.featured;
      return list.all
         .filter((m) =>
            `${m.name} ${m.id} ${m.provider}`.toLowerCase().includes(q),
         )
         .slice(0, 80);
   }, [list, search]);

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (!next) setSearch("");
         }}
      >
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               size="xs"
               disabled={disabled}
               className="max-w-56 font-normal text-muted-foreground"
               title={value}
            >
               <span className="truncate">
                  {current?.name ?? value?.split("/")[1] ?? "Model"}
               </span>
               <ChevronsUpDownIcon />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" side="top" className="w-80 p-0">
            <div className="border-b p-2">
               <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                     list
                        ? `Search ${list.all.length} OpenRouter models`
                        : "Search models"
                  }
                  className="h-8"
               />
            </div>
            <div className="max-h-80 overflow-y-auto overscroll-contain p-1">
               {models.isLoading && (
                  <Loader2Icon className="m-3 size-4 animate-spin text-muted-foreground" />
               )}
               {models.error && (
                  <p className="p-3 text-xs text-destructive">
                     {models.error.message}
                  </p>
               )}
               {!search && list && (
                  <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                     Suggested
                  </div>
               )}
               {shown.map((m) => (
                  <ModelRow
                     key={m.id}
                     model={m}
                     selected={m.id === value}
                     isDefault={m.id === list?.default}
                     onSelect={() => {
                        onChange(m.id);
                        setOpen(false);
                        setSearch("");
                     }}
                  />
               ))}
               {list && search && shown.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">
                     No tool-capable model matches.
                  </p>
               )}
            </div>
         </PopoverContent>
      </Popover>
   );
}

function ModelRow({
   model,
   selected,
   isDefault,
   onSelect,
}: {
   model: ModelInfo;
   selected: boolean;
   isDefault: boolean;
   onSelect: () => void;
}) {
   return (
      <button
         onClick={onSelect}
         className={cn(
            "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
            selected && "bg-accent",
         )}
      >
         <CheckIcon
            className={cn("mt-0.5 size-3.5 shrink-0", !selected && "invisible")}
         />
         <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5 text-sm">
               <span className="truncate">{model.name}</span>
               {isDefault && (
                  <span className="text-[10px] text-muted-foreground">
                     default
                  </span>
               )}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
               {model.id}
            </span>
         </span>
         {model.inputPrice !== undefined && (
            <span
               className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground"
               title="USD per million input / output tokens"
            >
               ${price(model.inputPrice)}/${price(model.outputPrice ?? 0)}
            </span>
         )}
      </button>
   );
}

function price(perMillion: number): string {
   if (perMillion === 0) return "0";
   return perMillion < 1
      ? perMillion.toFixed(2).replace(/0$/, "")
      : String(Math.round(perMillion * 10) / 10);
}
