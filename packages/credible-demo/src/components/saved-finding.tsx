// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A finding saved into a package, drawn with this app's own components: the
// same chart an analysis draws, the same report a thread does. Charts are
// live when they can be, and the page says when they are the saved rows.

import {
   analysisFromManifest,
   recordFromManifest,
   slugOfAppPath,
   withRows,
   type AppManifest,
   type ManifestLocation,
} from "@malloy-publisher/app-manifest";
import { loadTables } from "@malloy-publisher/app-manifest/runtime/load";
import { useQuery } from "@tanstack/react-query";
import { EvidenceChart } from "@/components/evidence-chart";
import { runManifestQuery, WORKSPACE_ENVIRONMENT } from "@/data/publisher";
import type { Analysis, WorkspaceItem } from "@/data/types";
import type { AnalystRecord } from "@/analyst/record";
import { AnalystMessage } from "@/features/analyst/analyst-message";
import { cn } from "@/lib/utils";

export const manifestAt = (
   pkg: string,
   item: Pick<WorkspaceItem, "id">,
): ManifestLocation => ({
   environment: WORKSPACE_ENVIRONMENT,
   package: pkg,
   slug: slugOfAppPath(item.id) ?? item.id,
});

/** What a saved finding is, in this app's own terms. */
export type SavedFinding =
   | { kind: "analysis"; analysis: Analysis }
   | { kind: "report"; record: AnalystRecord };

export function savedFinding(
   m: AppManifest,
   at: ManifestLocation,
): SavedFinding {
   return m.kind === "analysis"
      ? { kind: "analysis", analysis: analysisFromManifest(m, at) as Analysis }
      : { kind: "report", record: recordFromManifest(m, at) };
}

/**
 * The finding with live rows where its queries still answer as written, and
 * the saved rows, with why, where they don't.
 */
export function useLiveFinding(pkg: string, item: WorkspaceItem) {
   const m = item.manifest;
   const live = useQuery({
      queryKey: ["saved-finding", pkg, item.id, m?.updatedAt],
      queryFn: () => loadTables(m!, (q) => runManifestQuery(pkg, q)),
      enabled: Boolean(m),
      staleTime: 60_000,
      retry: false,
   });
   if (!m) return undefined;
   const rows = Object.fromEntries(
      Object.entries(live.data?.tables ?? {}).map(([id, t]) => [id, t.rows]),
   );
   return {
      finding: savedFinding(withRows(m, rows), manifestAt(pkg, item)),
      manifest: m,
      loading: live.isPending,
      failed: Object.entries(live.data?.failed ?? {}),
   };
}

/** A saved finding's chart or report as its Library card shows it, from the saved rows. */
export function SavedFindingPreview({
   pkg,
   item,
   className,
}: {
   pkg: string;
   item: WorkspaceItem & { manifest: AppManifest };
   className?: string;
}) {
   const f = savedFinding(item.manifest, manifestAt(pkg, item));
   return f.kind === "analysis" ? (
      <div className={cn("rounded-lg border bg-muted/20 p-3", className)}>
         <EvidenceChart
            evidence={f.analysis.evidence}
            compact
            className="h-36"
         />
      </div>
   ) : (
      <ReportPreview record={f.record} className={className} />
   );
}

/** The top of an analyst's report, inert, clipped to a card with a fade. */
export function ReportPreview({
   record,
   className,
}: {
   record: AnalystRecord;
   className?: string;
}) {
   return (
      <div
         className={cn(
            "pointer-events-none relative max-h-80 overflow-hidden rounded-lg border bg-card p-4",
            className,
         )}
         aria-hidden
      >
         <AnalystMessage record={record} />
         <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
      </div>
   );
}
