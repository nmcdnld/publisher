// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A saved finding as its own page, laid out as the insight it was saved
// from: the same header, narrative, chart card and report blocks, drawn by
// the same components, so the standalone app is the one the reader saw.

import type { AppManifest } from "@malloy-publisher/app-manifest";
import { EvidenceChart } from "@/components/evidence-chart";
import { Provenance } from "@/components/provenance";
import { savedFinding } from "@/components/saved-finding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalystMessage } from "@/features/analyst/analyst-message";

const asOf = (iso: string) => new Date(iso).toLocaleDateString();

export function FindingPage({
   manifest: m,
   finding,
   failed,
}: {
   manifest: AppManifest;
   finding: ReturnType<typeof savedFinding>;
   failed: [string, string][];
}) {
   const byline = [m.author?.name, `saved ${asOf(m.updatedAt)}`]
      .filter(Boolean)
      .join(" · ");
   return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8 lg:px-10">
         <header className="space-y-3">
            {m.topics.length > 0 && (
               <div className="flex flex-wrap gap-1.5">
                  {m.topics.map((t) => (
                     <Badge key={t} variant="secondary">
                        #{t}
                     </Badge>
                  ))}
               </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight">{m.title}</h1>
            <p className="text-sm text-muted-foreground">{byline}</p>
         </header>

         {finding.kind === "report" ? (
            <AnalystMessage record={finding.record} />
         ) : (
            <>
               <p className="text-xl leading-relaxed">
                  {finding.analysis.narrative}
               </p>
               {finding.analysis.details.length > 0 && (
                  <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                     {finding.analysis.details.map((d) => (
                        <li key={d}>{d}</li>
                     ))}
                  </ul>
               )}
               <Card>
                  <CardHeader className="flex-row items-center justify-between">
                     <CardTitle className="text-sm font-medium text-muted-foreground">
                        {finding.analysis.evidence.caption ?? "Evidence"}
                     </CardTitle>
                     <Provenance provenance={finding.analysis.provenance} />
                  </CardHeader>
                  <CardContent data-chart="drawn">
                     <EvidenceChart evidence={finding.analysis.evidence} />
                  </CardContent>
               </Card>
            </>
         )}

         <p className="text-xs text-muted-foreground">
            {failed.length
               ? `Showing the rows as of ${asOf(m.snapshot.asOf)}: ${failed.length === 1 ? "a query" : `${failed.length} queries`} could not be shown live (${failed[0][1]}).`
               : `Charts are live. The text was written against the data as of ${asOf(m.snapshot.asOf)}.`}
         </p>
      </div>
   );
}
