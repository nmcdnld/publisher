// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext, type ReactNode } from "react";

export interface PublishColumn {
   name: string;
   /** `# label` on the field, when it has one. */
   label?: string;
   type: "string" | "number" | "date" | "boolean" | "other";
   /** `# currency` or `# percent` on the field. */
   format?: "currency" | "percent";
}

/** A result flattened to plain rows: what a destination can chart without Malloy. */
export interface PublishTable {
   columns: PublishColumn[];
   rows: Record<string, string | number | boolean | null>[];
   /** Rows the query returned, which is more than `rows` holds when it was capped. */
   totalRows: number;
}

/** The content a Publish button hands to the host, which decides where it goes. */
export type PublishRequest =
   | {
        kind: "query";
        environmentName: string;
        packageName: string;
        modelPath: string;
        sourceName: string;
        malloy: string;
        givens?: Record<string, unknown>;
        result: PublishTable;
     }
   | {
        kind: "dashboard";
        environmentName: string;
        packageName: string;
        modelPath: string;
        dashboardName: string;
        title?: string;
        description?: string;
        givens?: Record<string, unknown>;
     };

export interface PublishContextValue {
   publish: (request: PublishRequest) => void;
   /** The button's label; names the destination when the host has one. */
   label?: string;
}

const PublishContext = createContext<PublishContextValue | null>(null);

/**
 * Turns on the Publish buttons below it. Without a provider the SDK renders
 * none, so an embedder that has nowhere to publish to sees no dead control.
 */
export function PublishProvider({
   value,
   children,
}: {
   value: PublishContextValue;
   children: ReactNode;
}) {
   return (
      <PublishContext.Provider value={value}>
         {children}
      </PublishContext.Provider>
   );
}

export function usePublish(): PublishContextValue | null {
   return useContext(PublishContext);
}
