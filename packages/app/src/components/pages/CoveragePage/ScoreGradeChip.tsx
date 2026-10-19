// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { cn } from "../../../lib/utils";
import { Badge } from "../../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { scoreGrade } from "./model";

export function ScoreGradeChip({
   score,
   provisional = false,
   className,
}: {
   score: number;
   provisional?: boolean;
   className?: string;
}) {
   const grade = scoreGrade(score);
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <Badge
               variant={null}
               className={cn(
                  grade.chip,
                  provisional && "opacity-60",
                  className,
               )}
            >
               {grade.label}
            </Badge>
         </TooltipTrigger>
         <TooltipContent>
            {provisional ? "So far: " : ""}
            {grade.description}
         </TooltipContent>
      </Tooltip>
   );
}
