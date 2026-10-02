// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

export function ChartFailure({ message }: { message: string }) {
   return (
      <p className="text-muted-foreground absolute inset-0 grid place-items-center p-2 text-center text-xs">
         This chart didn&rsquo;t render: {message}
      </p>
   );
}
