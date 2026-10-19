// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { BookOpenIcon, ChevronRightIcon, GridIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOntology } from "../../../ontology/useOntology";
import type { Ontology } from "../../../ontology/types";
import { usePrototypeFeatures } from "../../../prototypeFeatures";
import { Progress } from "../../ui/misc";
import { TailwindScope } from "../../ui/scope";
import { useRunHistory } from "../CoveragePage/model";
import { ScoreGradeChip } from "../CoveragePage/ScoreGradeChip";

export default function PackageInsights({
   environmentName,
   packageName,
}: {
   environmentName: string;
   packageName: string;
}) {
   const { dataDictionary, questionCoverage } = usePrototypeFeatures();
   if (!dataDictionary && !questionCoverage) return null;
   return (
      <Insights
         environmentName={environmentName}
         packageName={packageName}
         dataDictionary={dataDictionary}
         questionCoverage={questionCoverage}
      />
   );
}

function Insights({
   environmentName,
   packageName,
   dataDictionary,
   questionCoverage,
}: {
   environmentName: string;
   packageName: string;
   dataDictionary: boolean;
   questionCoverage: boolean;
}) {
   const ontology = useOntology(environmentName, packageName);
   const base = `/${environmentName}/${packageName}`;
   const stats = ontology.data?.stats;
   const documented = stats?.documentable
      ? Math.round((stats.documented / stats.documentable) * 100)
      : undefined;
   return (
      <TailwindScope className="mb-8 grid gap-3 sm:grid-cols-2">
         {dataDictionary && (
            <Tile
               to={`${base}/dictionary`}
               icon={<BookOpenIcon className="size-4" />}
               title="Data Dictionary"
               detail={
                  stats
                     ? `${stats.sources} sources · ${stats.measures} measures · ${stats.views} views`
                     : "Every source, measure, view and given, one page each"
               }
            >
               {documented !== undefined && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                     <Progress value={documented} className="h-1 flex-1" />
                     {documented}% documented
                  </div>
               )}
            </Tile>
         )}
         {questionCoverage && (
            <Tile
               to={`${base}/coverage`}
               icon={<GridIcon className="size-4" />}
               title="Question coverage"
               detail="How many of the questions people ask can this model answer?"
            >
               {ontology.data && <LastScore ontology={ontology.data} />}
            </Tile>
         )}
      </TailwindScope>
   );
}

function LastScore({ ontology }: { ontology: Ontology }) {
   const { runs } = useRunHistory(ontology);
   const last = runs.find((r) => r.score !== undefined);
   return (
      <div className="text-xs text-muted-foreground">
         {last ? (
            <div className="flex items-center gap-2">
               <span className="text-sm font-semibold tabular-nums text-foreground">
                  {last.score}
               </span>
               <ScoreGradeChip score={last.score!} />
               <span>
                  on {last.questions.length} questions,{" "}
                  {new Date(last.at).toLocaleDateString()}
               </span>
            </div>
         ) : (
            "Not measured yet"
         )}
      </div>
   );
}

function Tile({
   to,
   icon,
   title,
   detail,
   children,
}: {
   to: string;
   icon: ReactNode;
   title: string;
   detail: string;
   children?: ReactNode;
}) {
   return (
      <Link
         to={to}
         className="group flex flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/40"
      >
         <div className="flex items-center gap-2 text-sm font-medium">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
               {icon}
            </span>
            {title}
            <ChevronRightIcon className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
         </div>
         <p className="text-sm text-muted-foreground">{detail}</p>
         {children}
      </Link>
   );
}
