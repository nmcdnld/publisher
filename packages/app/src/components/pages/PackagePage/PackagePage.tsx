// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { encodeResourceUri, Package } from "@malloy-publisher/sdk";
import { useRouterClickHandler } from "@malloy-publisher/sdk";

const PackageInsights = lazy(() => import("./PackageInsights"));

function PackagePage() {
   const { environmentName, packageName } = useParams();
   const navigate = useRouterClickHandler();
   if (!environmentName) {
      return (
         <div>
            <h2>Missing environment name</h2>
         </div>
      );
   } else if (!packageName) {
      return (
         <div>
            <h2>Missing package name</h2>
         </div>
      );
   } else {
      const resourceUri = encodeResourceUri({
         environmentName,
         packageName,
      });
      return (
         <Package
            onClickPackageFile={navigate}
            resourceUri={resourceUri}
            insights={
               <Suspense fallback={null}>
                  <PackageInsights
                     environmentName={environmentName}
                     packageName={packageName}
                  />
               </Suspense>
            }
         />
      );
   }
}
export default PackagePage;
