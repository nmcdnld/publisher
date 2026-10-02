// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   analysisHome,
   appPaths,
   manifestFromAnalysis,
   manifestFromReport,
   reportHome,
   type AppManifest,
   type FindingHome,
} from "@malloy-publisher/app-manifest";
import type { ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import type { AnalystRecord } from "@/analyst/record";
import { WORKSPACE_ENVIRONMENT } from "@/data/publisher";
import type { Promotable } from "@/data/sync";
import type { Analysis, PackageRef, Person } from "@/data/types";

/** The report an analysis saved from a chat answer carries, when it has one. */
const reportOf = (a: Analysis) =>
   a.report?.report
      ? (a.report as AnalystRecord & { report: ReportSpec })
      : undefined;

/**
 * The package a finding can be saved into: the one its data came from, and
 * only when that package is in the environment this app writes to.
 */
export function findingHome(p: Promotable): FindingHome {
   const report = reportOf(p.finding.analysis);
   const home = report ? reportHome(report) : analysisHome(p.finding.analysis);
   if (home.ok && home.environment !== WORKSPACE_ENVIRONMENT) {
      return {
         ok: false,
         problem: `Its data comes from the ${home.environment} environment, and this app saves into ${WORKSPACE_ENVIRONMENT}.`,
      };
   }
   return home;
}

/** The manifest a save writes, with the title and description as edited. */
export function findingManifest(
   p: Promotable,
   edits: { title: string; description: string },
   saver: Person,
): AppManifest {
   const a = p.finding.analysis;
   const report = reportOf(a);
   const opts = {
      authorName: a.authorId === saver.id ? saver.name : undefined,
   };
   const base = report
      ? manifestFromReport({ ...a, report }, opts)
      : manifestFromAnalysis(a, opts);
   return {
      ...base,
      title: edits.title.trim() || base.title,
      description: edits.description.trim() || base.description,
   };
}

/** How a Library item points at the app it was saved as. */
export function dataAppRef(pkg: string, slug: string): PackageRef {
   const paths = appPaths(slug);
   return {
      package: pkg,
      kind: "data_app",
      id: paths.index,
      path: paths.manifest,
   };
}
