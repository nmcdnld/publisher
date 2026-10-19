// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { PackageRow } from "../components/PackageRow";
import { PageHeader } from "../components/PageHeader";
import { environments, packages } from "../fixtures";

export function PackagesPage() {
   return (
      <div className="ui-zoom flex h-full flex-col">
         <PageHeader title="Packages" />
         <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[540px] px-4 pt-14 pb-10">
               <h1 className="text-[22px] font-medium tracking-tight">
                  Packages
               </h1>
               <p className="mt-2 text-[11px] text-muted">
                  Every package you have access to, by the environment it is
                  published to.
               </p>

               {environments.map((env) => {
                  const inEnv = packages.filter(
                     (p) => p.environment === env.name,
                  );
                  return (
                     <section key={env.id} className="mt-8">
                        <h2 className="text-[13px] font-medium">{env.name}</h2>
                        <p className="mt-0.5 mb-3 text-[10px] text-muted">
                           Packages published to this environment.
                        </p>
                        <div className="space-y-1">
                           {inEnv.length ? (
                              inEnv.map((p) => (
                                 <PackageRow
                                    key={p.id}
                                    pkg={p}
                                    showEnvironment={false}
                                 />
                              ))
                           ) : (
                              <p className="text-[10px] text-muted">
                                 No packages yet.
                              </p>
                           )}
                        </div>
                     </section>
                  );
               })}
            </div>
         </div>
      </div>
   );
}
