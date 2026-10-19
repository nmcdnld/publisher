// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { packageFileUrl, useServer } from "@malloy-publisher/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { buildOntology, type ContentInput, type ModelInput } from "./build";
import { dataAppText } from "./dataAppText";

/**
 * Everything the dictionary and the Coverage Map know about a package, built from
 * what Publisher already serves: every model's compiled definition and source
 * text, and every dashboard, notebook and data app with the text that says
 * what it uses. Rebuilt when the
 * package's files change (watch mode's `events` stream).
 */
export function useOntology(environmentName: string, packageName: string) {
   const { apiClients, server } = useServer();
   const queryClient = useQueryClient();
   const queryKey = ["ontology", environmentName, packageName];

   const query = useQuery({
      queryKey,
      staleTime: 5 * 60_000,
      queryFn: async () => {
         const [pkg, modelList, dashboards, notebooks, dataApps] =
            await Promise.all([
               apiClients.packages.getPackage(environmentName, packageName),
               apiClients.models.listModels(environmentName, packageName),
               apiClients.dashboards
                  .listDashboards(environmentName, packageName)
                  .then((r) => r.data)
                  .catch(() => []),
               apiClients.notebooks
                  .listNotebooks(environmentName, packageName)
                  .then((r) => r.data)
                  .catch(() => []),
               apiClients.dataApps
                  .listDataApps(environmentName, packageName)
                  .then((r) => r.data)
                  .catch(() => []),
            ]);

         const models: ModelInput[] = await Promise.all(
            modelList.data
               .filter((m) => m.path)
               .map(async (m) => {
                  const path = m.path!;
                  try {
                     const response = await apiClients.models.getModel(
                        environmentName,
                        packageName,
                        path,
                     );
                     const data = response.data as unknown as ModelInput;
                     return {
                        path,
                        modelDef: data.modelDef,
                        sourceText: data.sourceText,
                        givens: data.givens,
                     };
                  } catch (error) {
                     return { path, error: errorMessage(error) };
                  }
               }),
         );

         const modelText = new Map(
            models.map((m) => [m.path, m.sourceText] as const),
         );
         const fetchText = async (url: string) => {
            try {
               const response = await fetch(url);
               return response.ok ? await response.text() : undefined;
            } catch {
               return undefined;
            }
         };
         const notebookText = async (path: string) => {
            if (modelText.get(path)) return modelText.get(path);
            try {
               const response = await apiClients.notebooks.getNotebook(
                  environmentName,
                  packageName,
                  path,
               );
               return (response.data.notebookCells ?? [])
                  .map((cell) => cell.text ?? "")
                  .join("\n");
            } catch {
               return undefined;
            }
         };

         const content: ContentInput[] = await Promise.all([
            ...dashboards
               .filter((d) => d.path && d.name)
               .map(
                  async (d): Promise<ContentInput> => ({
                     kind: "dashboard",
                     file: d.path!,
                     name: d.name,
                     title: d.title || d.name!,
                     description: d.description,
                     href: `dashboards/${d.name}`,
                     text: modelText.get(d.path!),
                  }),
               ),
            ...notebooks
               .filter((n) => n.path)
               .map(
                  async (n): Promise<ContentInput> => ({
                     kind: "notebook",
                     file: n.path!,
                     title: n.title || basename(n.path!),
                     href: n.path!.endsWith(".malloynb")
                        ? n.path!
                        : n.path!.replace(/\.malloy$/, ""),
                     text: await notebookText(n.path!),
                  }),
               ),
            ...dataApps
               .filter((app) => app.path)
               .map(
                  async (app): Promise<ContentInput> => ({
                     kind: "data app",
                     file: app.path!,
                     title: app.title || app.path!,
                     href: `data-apps/${app.path}`,
                     text: await dataAppText(
                        packageFileUrl({
                           server,
                           environmentName,
                           packageName,
                           path: app.path!,
                        }),
                        fetchText,
                     ),
                  }),
               ),
         ]);

         return buildOntology({
            environmentName,
            packageName,
            description: pkg.data.description,
            models,
            content,
         });
      },
   });

   useEffect(() => {
      const url = `${server}/environments/${encodeURIComponent(
         environmentName,
      )}/packages/${encodeURIComponent(packageName)}/events`;
      const events = new EventSource(url);
      events.addEventListener("changed", () => {
         queryClient.invalidateQueries({
            queryKey: ["ontology", environmentName, packageName],
         });
      });
      return () => events.close();
   }, [server, environmentName, packageName, queryClient]);

   return query;
}

/** Run one Malloy query against a model and return plain rows. */
export function useMalloyRows(
   environmentName: string,
   packageName: string,
   modelPath: string | undefined,
   malloy: string | undefined,
) {
   const { apiClients } = useServer();
   return useQuery({
      queryKey: [
         "dictionary-rows",
         environmentName,
         packageName,
         modelPath,
         malloy,
      ],
      enabled: Boolean(modelPath && malloy),
      staleTime: 5 * 60_000,
      retry: false,
      queryFn: async () => {
         const response = await apiClients.models.executeQueryModel(
            environmentName,
            packageName,
            modelPath!,
            {
               query: malloy,
               compactJson: true,
               queryMetadata: { surface: "data-dictionary" },
            },
         );
         return JSON.parse(response.data.result ?? "[]") as Array<
            Record<string, unknown>
         >;
      },
   });
}

export function errorMessage(error: unknown): string {
   const data = (error as { response?: { data?: { message?: string } } })
      ?.response?.data;
   if (data?.message) return data.message;
   return error instanceof Error ? error.message : String(error);
}

function basename(path: string): string {
   return (path.split("/").pop() ?? path).replace(/\.malloy(nb)?$/, "");
}
