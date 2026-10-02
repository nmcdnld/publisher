// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AppDialog,
   PublishProvider,
   PUBLISH_ROW_CAP,
   type PublishRequest,
} from "@malloy-publisher/sdk";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState, type ReactNode } from "react";
import { MONO_FONT_FAMILY } from "../../theme/colors";
import {
   DESTINATION_URL,
   destinationPublishUrl,
   draftFromRequest,
   type DestinationDraft,
} from "./destinationDraft";

/**
 * Turns on Publish across the Console when a destination is configured, and
 * owns the one review dialog every Publish button opens.
 */
export function ConsolePublishProvider({ children }: { children: ReactNode }) {
   const [draft, setDraft] = useState<DestinationDraft | null>(null);
   const value = useMemo(
      () => ({
         label: "Publish",
         publish: (request: PublishRequest) =>
            setDraft(draftFromRequest(request, window.location.href)),
      }),
      [],
   );
   if (!DESTINATION_URL) return <>{children}</>;
   return (
      <PublishProvider value={value}>
         {children}
         {draft && (
            <PublishDialog
               key={draft.preparedAt}
               draft={draft}
               destinationUrl={DESTINATION_URL}
               onClose={() => setDraft(null)}
            />
         )}
      </PublishProvider>
   );
}

function PublishDialog({
   draft,
   destinationUrl,
   onClose,
}: {
   draft: DestinationDraft;
   destinationUrl: string;
   onClose: () => void;
}) {
   const [title, setTitle] = useState(draft.title);
   const [description, setDescription] = useState(draft.description);
   const { provenance, result, givens } = draft;
   const where = [provenance.package, provenance.model, provenance.source]
      .concat(provenance.view ? [provenance.view] : [])
      .join(" › ");

   const open = () => {
      window.open(
         destinationPublishUrl(destinationUrl, {
            ...draft,
            title: title.trim() || draft.title,
            description: description.trim(),
         }),
         "_blank",
         "noopener",
      );
      onClose();
   };

   return (
      <AppDialog
         open
         onClose={onClose}
         title={
            draft.kind === "dashboard" ? "Publish dashboard" : "Publish result"
         }
         description="Prepares this for the destination app, where you choose where it's posted before anyone sees it."
         maxWidth="md"
         actions={
            <>
               <Button onClick={onClose}>Cancel</Button>
               <Button
                  variant="contained"
                  endIcon={<OpenInNewIcon />}
                  onClick={open}
                  disabled={!title.trim()}
               >
                  Continue in destination
               </Button>
            </>
         }
      >
         <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            fullWidth
         />
         <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should a reader take from this?"
            multiline
            minRows={2}
            fullWidth
         />
         <Box>
            <Typography variant="overline" color="text.secondary">
               What gets sent
            </Typography>
            <Stack gap={1}>
               <Typography
                  variant="body2"
                  sx={{ fontFamily: MONO_FONT_FAMILY }}
               >
                  {provenance.environment} / {where}
               </Typography>
               <Typography variant="body2" color="text.secondary">
                  {result
                     ? `${result.rows.length.toLocaleString()} of ${result.totalRows.toLocaleString()} rows · ${result.columns.length} columns${result.totalRows > PUBLISH_ROW_CAP ? ` (the first ${PUBLISH_ROW_CAP} are kept)` : ""}, plus the Malloy that produced them.`
                     : "A link to the live dashboard, with the filters as they are set now."}
               </Typography>
               {givens && (
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                     {Object.entries(givens).map(([name, value]) => (
                        <Chip
                           key={name}
                           size="small"
                           variant="outlined"
                           label={`${name} = ${typeof value === "string" ? value : JSON.stringify(value)}`}
                        />
                     ))}
                  </Stack>
               )}
               {draft.malloy && (
                  <Box
                     component="pre"
                     sx={{
                        m: 0,
                        p: 1.5,
                        maxHeight: 180,
                        overflow: "auto",
                        borderRadius: 1,
                        bgcolor: "action.hover",
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                     }}
                  >
                     {draft.malloy}
                  </Box>
               )}
            </Stack>
         </Box>
      </AppDialog>
   );
}
