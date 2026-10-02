// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Link } from "react-router-dom";
import { PageContainer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
   return (
      <PageContainer className="py-24 text-center">
         <h1 className="text-2xl font-semibold">Nothing here</h1>
         <p className="mt-2 text-muted-foreground">That page doesn't exist.</p>
         <Button asChild className="mt-6">
            <Link to="/">Back to Discover</Link>
         </Button>
      </PageContainer>
   );
}
