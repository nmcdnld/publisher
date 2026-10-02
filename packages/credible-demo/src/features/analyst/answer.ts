// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Block } from "@malloy-publisher/app-manifest/analyst/blocks";
import { formatMetric } from "@malloy-publisher/app-manifest/analyst/format";
import {
   answerText,
   chartRows,
   datasetMap,
   metricMap,
   viewOf,
   type AnalystRecord,
} from "@/analyst/record";
import type { Dataset } from "@malloy-publisher/app-manifest/analyst/schema";
import type { Evidence, NewMessage, ThreadMessage } from "@/data/types";

const label = (ds: Dataset, name: string) =>
   ds.columns.find((c) => c.name === name)?.label ?? name.replace(/_/g, " ");

/** A dataset drawn the way the rest of the app draws evidence. */
export function toEvidence(
   ds: Dataset,
   opts: {
      mark?: Evidence["kind"];
      x?: string;
      y?: string[];
      caption?: string;
      highlight?: string;
   } = {},
): Evidence {
   const x =
      opts.x ??
      ds.columns.find((c) => c.type !== "number")?.name ??
      ds.columns[0].name;
   const y =
      opts.y ??
      ds.columns
         .filter((c) => c.type === "number" && c.name !== x)
         .map((c) => c.name);
   const unit = ds.columns.find((c) => c.name === y[0])?.unit;
   return {
      kind: opts.mark ?? "bar",
      xKey: x,
      series: y.map((key) => ({ key, label: label(ds, key) })),
      rows: chartRows(ds, x),
      format: unit ?? "number",
      caption: opts.caption ?? ds.title,
      highlight: opts.highlight,
   };
}

/**
 * The fields the rest of the thread UI reads (Save, Publish, the Library
 * card), taken from the report's lead chart, or its first table or dataset.
 */
export function answerFields(record: AnalystRecord): NewMessage {
   const blocks: Block[] =
      record.report?.sections.flatMap((s) => s.blocks) ?? [];
   const datasets = datasetMap(record);
   const metrics = metricMap(record);
   const chart = blocks.find((b) => b.type === "chart");
   const table = blocks.find((b) => b.type === "table");
   const ds =
      (chart && datasets.get(chart.data.datasetId)) ||
      (table && datasets.get(table.data.datasetId)) ||
      record.datasets[0];
   const fields: NewMessage = {
      text: answerText(record) || "The analyst couldn't finish this question.",
      analyst: record,
   };
   if (!ds) return fields;
   const highlight =
      chart?.highlight?.[0] && metrics.get(chart.highlight[0].metricId);
   fields.evidence = toEvidence(ds, {
      mark: chart
         ? chart.mark === "scatter"
            ? "line"
            : chart.mark
         : undefined,
      x: chart?.x,
      y: chart?.y,
      caption: chart?.title,
      highlight: highlight ? formatMetric(highlight) : undefined,
   });
   fields.malloy = ds.query;
   fields.provenance = {
      environment: ds.source.environment,
      package: ds.source.package,
      model: ds.source.model,
      source: ds.source.source,
      view: viewOf(ds),
   };
   return fields;
}

/** Earlier analyst turns, numbers written out, for a follow-up's context. */
export function historyOf(messages: ThreadMessage[] = []) {
   const out: { question: string; answer: string; notes?: string[] }[] = [];
   messages.forEach((m, i) => {
      if (m.role !== "assistant" || !m.analyst?.report) return;
      const question = messages
         .slice(0, i)
         .reverse()
         .find((q) => q.role === "user")?.text;
      if (!question) return;
      const metrics = metricMap(m.analyst);
      const notes = m.analyst.report.sections
         .flatMap((s) => s.blocks)
         .flatMap((b) =>
            b.type === "insight" || b.type === "summary" ? [b.text] : [],
         )
         .map((t) =>
            t.replace(/\{\{metric:(\w+)\}\}/g, (_, id) => {
               const metric = metrics.get(id);
               return metric ? formatMetric(metric) : "…";
            }),
         );
      out.push({ question, answer: m.text, notes });
   });
   return out.slice(-4);
}
