// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Dashboard,
   DataAppViewer,
   encodeResourceUri,
   Loading,
   Model,
   Notebook,
   useDocumentLocation,
   useGivenUrlParams,
} from "@malloy-publisher/sdk";
import type { ReactNode } from "react";
import type { Served } from "../fixtures";

const MAX_RESULT_SIZE = 1024 * 1024;

export function ServedDashboard({
   served,
   slug,
}: {
   served: Served;
   slug: string;
}) {
   // Control values ride in the query string, so a filtered view is a link.
   const { params: givens, onGivensChange } = useGivenUrlParams();
   return (
      <Dashboard
         resourceUri={encodeResourceUri({
            environmentName: served.environment,
            packageName: served.package,
         })}
         dashboard={slug}
         givens={givens}
         onGivensChange={onGivensChange}
         maxResultSize={MAX_RESULT_SIZE}
      />
   );
}

export function ServedNotebook({
   served,
   path,
}: {
   served: Served;
   path: string;
}) {
   const { params: givens, onGivensChange } = useGivenUrlParams();
   return (
      <Notebook
         resourceUri={encodeResourceUri({
            environmentName: served.environment,
            packageName: served.package,
            modelPath: path,
         })}
         givens={givens}
         onGivensChange={onGivensChange}
         maxResultSize={MAX_RESULT_SIZE}
      />
   );
}

/**
 * One file of a package, at the path Publisher's `Package` view links it by:
 * `dashboards/<slug>` and `notebooks/<slug>` are documents, `data-apps/<file>`
 * is an HTML data app, and a `.malloy` or `.malloynb` path is the file itself.
 * Same branching as the Console's model page.
 */
export function ServedPackageFile({
   served,
   path,
}: {
   served: Served;
   path: string;
}) {
   const isModelFile = path.endsWith(".malloy") || path.endsWith(".malloynb");
   const [head, ...rest] = path.split("/");
   // There is no builder here, so an edit link opens the document to read.
   const slug = rest.join("/").replace(/\/edit$/, "");

   if (!isModelFile && (head === "dashboards" || head === "notebooks")) {
      return (
         <ServedDocument
            served={served}
            routeKind={head === "dashboards" ? "dashboard" : "notebook"}
            slug={slug}
         />
      );
   }
   if (!isModelFile && head === "data-apps") {
      return (
         <DataAppViewer
            resourceUri={encodeResourceUri({
               environmentName: served.environment,
               packageName: served.package,
               modelPath: slug,
            })}
         />
      );
   }
   if (path.endsWith(".malloynb")) {
      return <ServedNotebook served={served} path={path} />;
   }
   if (path.endsWith(".malloy")) {
      return <ServedModel served={served} path={path} />;
   }
   return (
      <Unavailable>
         <span className="font-mono">{path}</span> is not a dashboard, notebook,
         data app or model in this package.
      </Unavailable>
   );
}

/**
 * A `dashboards/` or `notebooks/` route, opened as what the package lists it
 * as: the artifact tag decides the kind, not the folder it lives in.
 */
function ServedDocument({
   served,
   routeKind,
   slug,
}: {
   served: Served;
   routeKind: "dashboard" | "notebook";
   slug: string;
}) {
   const { location, settled } = useDocumentLocation(
      served.environment,
      served.package,
      routeKind,
      slug,
   );
   if (!settled) return <Loading text="Opening..." />;
   return (location?.kind ?? routeKind) === "dashboard" ? (
      <ServedDashboard served={served} slug={slug} />
   ) : (
      <ServedNotebook
         served={served}
         path={location?.path ?? `notebooks/${slug}.malloy`}
      />
   );
}

function ServedModel({ served, path }: { served: Served; path: string }) {
   const { params: givens, onGivensChange } = useGivenUrlParams();
   return (
      <Model
         resourceUri={encodeResourceUri({
            environmentName: served.environment,
            packageName: served.package,
            modelPath: path,
         })}
         runOnDemand={true}
         givens={givens}
         onGivensChange={onGivensChange}
         maxResultSize={MAX_RESULT_SIZE}
      />
   );
}

export function Unavailable({ children }: { children: ReactNode }) {
   return (
      <div className="ui-zoom mx-auto w-full max-w-[540px] px-4 pt-14">
         <p className="text-[11px] text-muted">{children}</p>
      </div>
   );
}
