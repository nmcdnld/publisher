// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { environments, packages } from "../fixtures";

function lookupTitle(section?: string, id?: string): string | undefined {
   switch (section) {
      case "packages":
         return packages.find((p) => p.id === id)?.name;
      case "environments":
         return environments.find((e) => e.id === id)?.name;
   }
}

export function DetailPage() {
   const { section, id } = useParams();
   const sectionTitle = section
      ? section[0].toUpperCase() + section.slice(1)
      : "Not found";
   const title = id ? (lookupTitle(section, id) ?? "Not found") : sectionTitle;

   return (
      <div className="ui-zoom">
         <PageHeader title={title} />
         <div className="mx-auto w-full max-w-[540px] px-4 pt-14">
            <h2 className="text-[22px] font-medium tracking-tight">{title}</h2>
            <p className="mt-2 text-[11px] text-muted">
               Placeholder page, running on fixture data.
            </p>
         </div>
      </div>
   );
}
