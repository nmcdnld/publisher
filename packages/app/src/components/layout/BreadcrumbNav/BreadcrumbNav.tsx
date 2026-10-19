// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useRouterClickHandler } from "@malloy-publisher/sdk";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Chip from "@mui/material/Chip";
import { MouseEvent } from "react";
import { useParams } from "react-router-dom";

interface BreadcrumbChipProps {
   label: string;
   onClick: (event: MouseEvent) => void;
}

function BreadcrumbChip({ label, onClick }: BreadcrumbChipProps) {
   return (
      <Chip
         clickable
         onClick={onClick}
         label={label}
         size="small"
         aria-label={`Navigate to ${label}`}
         sx={(theme) => ({
            // The page's own ground with a border, not a raised fill: a
            // breadcrumb is a path, not five objects sitting on the page, and
            // `background.paper` on a darker page drew each crumb as a lit
            // box. Same construction the dashboard cards use.
            backgroundColor: "transparent",
            border: `1px solid ${theme.palette.divider}`,
            color: "text.primary",
            fontWeight: 500,
            fontSize: "0.875rem",
            height: 32,
            cursor: "pointer",
            borderRadius: "4px",
            maxWidth: 320,
            "& .MuiChip-label": {
               overflow: "hidden",
               textOverflow: "ellipsis",
               whiteSpace: "nowrap",
            },
            "&:hover": {
               // grey.100 in our palette is a near-white #F4F3F1, which
               // matches the light-mode text colour at hover and makes
               // the label invisible in dark mode. Use a translucent
               // white in dark and the off-white grey in light so the
               // chip stays legible in both modes.
               backgroundColor:
                  theme.palette.mode === "dark"
                     ? "rgba(255, 255, 255, 0.08)"
                     : "grey.100",
            },
         })}
      />
   );
}

export default function BreadcrumbNav() {
   const params = useParams();
   const modelPath = params["*"];
   const navigate = useRouterClickHandler();
   // A dictionary page reads as dictionary › order_items.margin_rate, not as one long
   // path; `""` is the dictionary index itself.
   const dictionaryEntity =
      modelPath === "dictionary"
         ? ""
         : modelPath?.startsWith("dictionary/") &&
             !/\.malloy(nb)?$/.test(modelPath)
           ? modelPath.slice("dictionary/".length).replace(/^.*?:/, "")
           : undefined;

   if (!params.environmentName && !params.packageName && !modelPath) {
      return null;
   }

   return (
      <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
         <Breadcrumbs
            aria-label="breadcrumb"
            separator={
               <ChevronRight sx={{ fontSize: 14, color: "text.secondary" }} />
            }
         >
            {params.environmentName && (
               <BreadcrumbChip
                  label={params.environmentName}
                  onClick={(event) =>
                     navigate(`/${params.environmentName}/`, event)
                  }
               />
            )}

            {params.packageName && (
               <BreadcrumbChip
                  label={params.packageName}
                  onClick={(event) =>
                     navigate(
                        `/${params.environmentName}/${params.packageName}/`,
                        event,
                     )
                  }
               />
            )}

            {dictionaryEntity !== undefined && (
               <BreadcrumbChip
                  label="dictionary"
                  onClick={(event) =>
                     navigate(
                        `/${params.environmentName}/${params.packageName}/dictionary`,
                        event,
                     )
                  }
               />
            )}

            {modelPath && dictionaryEntity !== "" && (
               <BreadcrumbChip
                  label={dictionaryEntity ?? modelPath}
                  onClick={(event) =>
                     navigate(
                        `/${params.environmentName}/${params.packageName}/${modelPath}`,
                        event,
                     )
                  }
               />
            )}
         </Breadcrumbs>
      </Box>
   );
}
