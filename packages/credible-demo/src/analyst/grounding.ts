// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Grounding runs on the finished report before anyone sees it as final:
// every number on screen must trace back to a metric or a dataset from this
// run. A block that fails is dropped and the reason recorded; an answer line
// that fails asks for one repair.

import type { Block, ReportSection, ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import { formatTime } from "@malloy-publisher/app-manifest/analyst/format";
import type { Dataset, Findings, Metric } from "@malloy-publisher/app-manifest/analyst/schema";
import { bareNumbers, tokenIds } from "@malloy-publisher/app-manifest/analyst/tokens";

export interface GroundingIssue {
   /** Where in the report, e.g. `sections[1].blocks[0]` or `answer`. */
   path: string;
   blockType?: Block["type"];
   reason: string;
}

export interface GroundingResult {
   ok: boolean;
   /** The title and answer line passed; when false the run asks for a repair. */
   answerOk: boolean;
   dropped: GroundingIssue[];
   checked: number;
}

export interface GroundingContext {
   metrics: ReadonlyMap<string, Metric>;
   datasets: ReadonlyMap<string, Pick<Dataset, "id" | "columns" | "rows">>;
   /**
    * Digit runs that are data rather than claims: years and labels that
    * appear in the question or in a dataset's values ("2026", "Q3").
    */
   allowedNumbers: ReadonlySet<string>;
}

export function groundingContext(
   question: string,
   datasets: Iterable<Dataset>,
   metrics: Iterable<Metric>,
): GroundingContext {
   const allowed = new Set(bareNumbers(question));
   const ds = [...datasets];
   const ms = [...metrics];
   const addLabel = (v: string) => {
      for (const n of bareNumbers(v)) allowed.add(n);
      for (const n of bareNumbers(formatTime(v))) allowed.add(n);
   };
   for (const d of ds) {
      for (const col of d.columns) {
         if (col.type === "number") continue;
         for (const r of d.rows) {
            const v = r[col.name];
            if (typeof v === "string") addLabel(v);
         }
      }
   }
   for (const m of ms) if (typeof m.value === "string") addLabel(m.value);
   return {
      metrics: new Map(ms.map((m) => [m.id, m])),
      datasets: new Map(ds.map((d) => [d.id, d])),
      allowedNumbers: allowed,
   };
}

export function textIssues(
   text: string,
   ctx: GroundingContext,
   what: string,
): string[] {
   const out: string[] = [];
   for (const id of tokenIds(text)) {
      if (!ctx.metrics.has(id)) out.push(`${what} cites unknown metric ${id}`);
   }
   const bare = bareNumbers(text).filter((n) => !ctx.allowedNumbers.has(n));
   if (bare.length) {
      out.push(
         `${what} writes ${bare.map((n) => `"${n}"`).join(", ")} outside a metric token`,
      );
   }
   return out;
}

function blockIssues(block: Block, ctx: GroundingContext): string[] {
   const out: string[] = [];
   const metric = (id: string, what: string) => {
      if (!ctx.metrics.has(id)) out.push(`${what} cites unknown metric ${id}`);
   };
   const dataset = (id: string) => {
      const d = ctx.datasets.get(id);
      if (!d) out.push(`cites unknown dataset ${id}`);
      return d;
   };
   const columnsOf = (id: string, names: string[], what: string) => {
      const d = dataset(id);
      if (!d) return;
      const have = new Set(d.columns.map((c) => c.name));
      const numeric = new Set(
         d.columns.filter((c) => c.type === "number").map((c) => c.name),
      );
      for (const n of names) {
         if (!have.has(n)) out.push(`${what} "${n}" is not a column of ${id}`);
         else if (what === "y" && !numeric.has(n))
            out.push(`y "${n}" is not numeric`);
      }
   };
   switch (block.type) {
      case "kpi":
         out.push(...textIssues(block.label, ctx, "label"));
         metric(block.metric.metricId, "metric");
         if (block.compare) metric(block.compare.metricId, "compare");
         break;
      case "chart":
         out.push(...textIssues(block.title, ctx, "title"));
         columnsOf(block.data.datasetId, [block.x], "x");
         columnsOf(block.data.datasetId, block.y, "y");
         for (const h of block.highlight ?? []) metric(h.metricId, "highlight");
         break;
      case "table":
         out.push(...textIssues(block.title, ctx, "title"));
         columnsOf(block.data.datasetId, block.columns ?? [], "column");
         break;
      case "insight":
      case "summary":
         out.push(...textIssues(block.text, ctx, "text"));
         break;
      case "followUps":
         block.questions.forEach((q, i) =>
            out.push(...textIssues(q, ctx, `question ${i + 1}`)),
         );
         break;
   }
   return out;
}

/** Drops every block that fails and reports why. */
export function groundReport(
   report: ReportSpec,
   ctx: GroundingContext,
): { report: ReportSpec; result: GroundingResult } {
   const dropped: GroundingIssue[] = [];
   let checked = 0;
   const titleIssues = textIssues(report.title, ctx, "title");
   const answerIssues = textIssues(report.answer, ctx, "answer");
   for (const reason of titleIssues) dropped.push({ path: "title", reason });
   for (const reason of answerIssues) dropped.push({ path: "answer", reason });
   const head = [...titleIssues, ...answerIssues];

   const sections: ReportSection[] = [];
   report.sections.forEach((section, si) => {
      const blocks: Block[] = [];
      section.blocks.forEach((block, bi) => {
         checked++;
         const issues = blockIssues(block, ctx);
         if (issues.length === 0) blocks.push(block);
         else
            dropped.push({
               path: `sections[${si}].blocks[${bi}]`,
               blockType: block.type,
               reason: issues.join("; "),
            });
      });
      let heading = section.heading;
      if (heading) {
         const issues = textIssues(heading, ctx, "heading");
         if (issues.length) {
            dropped.push({
               path: `sections[${si}].heading`,
               reason: issues.join("; "),
            });
            heading = undefined;
         }
      }
      if (blocks.length) sections.push({ ...section, heading, blocks });
   });

   return {
      // A failing line is blanked rather than shown; the caller may repair it.
      report: {
         ...report,
         title: titleIssues.length ? "" : report.title,
         answer: answerIssues.length ? "" : report.answer,
         sections,
      },
      result: {
         ok: dropped.length === 0,
         answerOk: head.length === 0,
         dropped,
         checked,
      },
   };
}

/** Problems in the explorer's findings, for its one repair turn. */
export function findingsIssues(
   findings: Findings,
   ctx: GroundingContext,
): string[] {
   const out = textIssues(findings.answer, ctx, "answer");
   for (const f of findings.findings) {
      out.push(...textIssues(f.headline, ctx, `finding ${f.id} headline`));
      if (f.detail)
         out.push(...textIssues(f.detail, ctx, `finding ${f.id} detail`));
      for (const e of f.evidence) {
         if (!ctx.datasets.has(e.datasetId))
            out.push(`finding ${f.id} cites unknown dataset ${e.datasetId}`);
         for (const m of e.metricIds)
            if (!ctx.metrics.has(m))
               out.push(`finding ${f.id} cites unknown metric ${m}`);
      }
   }
   return out;
}
