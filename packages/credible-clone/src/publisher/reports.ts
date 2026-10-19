// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { Served } from "../fixtures";

export const REPORTS_ENVIRONMENT = "examples";

export type ReportKind = "dashboard" | "notebook";

export type Report = {
   title: string;
   kind: ReportKind;
   /** The dashboard's slug, or the notebook's path in the package. */
   served: Served & { name: string };
};

type Listed = { name?: string; path: string; title?: string };

async function get<T>(path: string): Promise<T> {
   const response = await fetch(`/api/v0${path}`);
   if (!response.ok) {
      throw new Error(`Publisher answered ${response.status} for ${path}`);
   }
   return (await response.json()) as T;
}

async function listReports(): Promise<Report[]> {
   const env = encodeURIComponent(REPORTS_ENVIRONMENT);
   const packages = await get<{ name: string }[]>(
      `/environments/${env}/packages`,
   );
   const perPackage = await Promise.all(
      packages.map(async ({ name: pkg }) => {
         const base = `/environments/${env}/packages/${encodeURIComponent(pkg)}`;
         const [dashboards, notebooks] = await Promise.all([
            get<Listed[]>(`${base}/dashboards`),
            get<Listed[]>(`${base}/notebooks`),
         ]);
         const served = { environment: REPORTS_ENVIRONMENT, package: pkg };
         return [
            ...dashboards.map(
               (d): Report => ({
                  title: d.title || d.name || d.path,
                  kind: "dashboard",
                  served: { ...served, name: d.name ?? d.path },
               }),
            ),
            ...notebooks.map(
               (n): Report => ({
                  title: n.title || n.path,
                  kind: "notebook",
                  served: { ...served, name: n.path },
               }),
            ),
         ];
      }),
   );
   return perPackage.flat();
}

/** Every dashboard and notebook the local Publisher serves, as reports. */
export function useReports() {
   return useQuery({ queryKey: ["clone-reports"], queryFn: listReports });
}

export const reportRoute = (r: Report) =>
   `/reports/${encodeURIComponent(r.served.package)}/${r.kind}/${r.served.name}`;
