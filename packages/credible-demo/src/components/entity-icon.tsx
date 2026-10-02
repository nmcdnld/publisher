// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AppWindow,
   BookOpen,
   Database,
   FileCode2,
   LayoutDashboard,
   Lightbulb,
   MessagesSquare,
   Package,
   type LucideIcon,
} from "lucide-react";
import type { EntityKind } from "@/data/types";
import { cn } from "@/lib/utils";

const icons: Record<EntityKind, LucideIcon> = {
   source: Database,
   dashboard: LayoutDashboard,
   notebook: BookOpen,
   data_app: AppWindow,
   model: FileCode2,
   package: Package,
   analysis: Lightbulb,
   thread: MessagesSquare,
};

export function EntityIcon({
   kind,
   className,
}: {
   kind: EntityKind;
   className?: string;
}) {
   const Icon = icons[kind];
   return <Icon className={cn("size-4", className)} />;
}
