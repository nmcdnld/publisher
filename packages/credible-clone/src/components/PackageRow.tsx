// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";
import type { Package } from "../fixtures";

export function PackageRow({
   pkg,
   showEnvironment = true,
}: {
   pkg: Package;
   showEnvironment?: boolean;
}) {
   return (
      <Link
         to={`/packages/${pkg.id}`}
         className="-mx-2 flex gap-2.5 rounded-md px-2 py-1.5 hover:bg-hover"
      >
         <span className="flex size-[22px] shrink-0 items-center justify-center rounded bg-package">
            <FolderOpen className="size-3 text-white" strokeWidth={1.75} />
         </span>
         <div className="min-w-0">
            <div className="flex items-center gap-2">
               <span className="text-[12px]">{pkg.name}</span>
               {showEnvironment && (
                  <span className="text-[9px] text-muted">
                     {pkg.environment}
                  </span>
               )}
               <span className="rounded bg-hover px-1.5 py-0.5 text-[9px] text-muted">
                  {pkg.status}
               </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted">{pkg.description}</p>
         </div>
      </Link>
   );
}
