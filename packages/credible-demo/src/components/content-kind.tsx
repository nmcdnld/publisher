// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AppWindow,
   BookOpen,
   Code2,
   LayoutDashboard,
   Lightbulb,
   type LucideIcon,
} from "lucide-react";
import type { ContentKind } from "@/data/types";
import { cn } from "@/lib/utils";

export const contentKinds: Record<
   ContentKind,
   { label: string; plural: string; icon: LucideIcon }
> = {
   insight: { label: "Insight", plural: "Insights", icon: Lightbulb },
   query: { label: "Query", plural: "Queries", icon: Code2 },
   dashboard: {
      label: "Dashboard",
      plural: "Dashboards",
      icon: LayoutDashboard,
   },
   notebook: { label: "Notebook", plural: "Notebooks", icon: BookOpen },
   data_app: { label: "Data app", plural: "Data apps", icon: AppWindow },
};

export function KindIcon({
   kind,
   className,
}: {
   kind: ContentKind;
   className?: string;
}) {
   const Icon = contentKinds[kind].icon;
   return <Icon className={cn("size-4", className)} />;
}
