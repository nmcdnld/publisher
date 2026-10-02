// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Box, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import React, { useMemo } from "react";
import { CompiledModel } from "../../client";
import { useDocumentControls } from "../../hooks/useDocumentControls";
import { parseResourceUri } from "../../utils/formatting";
import { ApiErrorDisplay } from "../ApiErrorDisplay";
import { GivensPanel } from "../given";
import { givensToRequest } from "../given/paramCodec";
import { Loading } from "../Loading";
import { StyledCard, StyledCardContent, StyledCardMedia } from "../styles";
import { runGate } from "./runGate";
import {
   type ExplorerMode,
   type QuestionContext,
   QueryExplorerResult,
   SourcesExplorer,
} from "./SourcesExplorer";
import { useModelData } from "./useModelData";

const MODE_STORAGE_KEY = "publisher.explorer.mode";

function storedMode(): ExplorerMode {
   try {
      return window.localStorage.getItem(MODE_STORAGE_KEY) === "question"
         ? "question"
         : "fields";
   } catch {
      return "fields";
   }
}

// Add a styled component for the multi-row tab bar
// const MultiRowTabBar = styled(Box)(({ theme }) => ({
//    display: "flex",
//    flexWrap: "wrap",
//    gap: theme.spacing(1),
//    borderBottom: "1px solid #f0f0f0",
//    minHeight: 48,
//    paddingBottom: "8px",
// }));

// const MultiRowTab = styled(Button)<{ selected?: boolean }>(
//    ({ theme, selected }) => ({
//       minHeight: 32,
//       padding: theme.spacing(0.75, 2),
//       borderRadius: "6px",
//       background: selected ? "#f8f9fa" : "transparent",
//       color: selected ? "#495057" : "#666666",
//       fontWeight: selected ? 600 : 500,
//       border: selected ? "1px solid #e9ecef" : "1px solid transparent",
//       boxShadow: "none",
//       textTransform: "none",
//       fontSize: "15px",
//       "&:hover": {
//          background: selected ? "#f8f9fa" : "#fafafa",
//          border: selected ? "1px solid #e9ecef" : "1px solid #f0f0f0",
//       },
//    }),
// );

export interface ModelExplorerProps {
   data?: CompiledModel;
   /** Callback when the explorer changes (e.g. when a query is selected). */
   onChange?: (query: QueryExplorerResult) => void;
   /** Existing query to initialize the explorer with */
   existingQuery?: QueryExplorerResult;
   /** Initial selected source index */
   initialSelectedSourceIndex?: number;
   /** Callback when source selection changes */
   onSourceChange?: (index: number) => void;
   resourceUri: string;
   /**
    * Control values from the host, typically its URL query parameters. These
    * beat the model's own starting values, so a shared link shows what the
    * sender was looking at.
    */
   givens?: Record<string, string>;
   /**
    * Applied control values, for a host that wants them in its URL.
    *
    * `managed` is every given this model declares, whether or not it currently
    * holds a value, and a host writing to a shared query string needs it.
    * `givens` alone says which parameters to write but not which to REMOVE, so
    * a host that guesses by deleting everything it did not just receive
    * deletes the unrelated parameters it has no business touching. Same
    * contract as `Dashboard` and `Notebook`, so a host can treat every surface
    * alike.
    */
   onGivensChange?: (
      givens: Record<string, string>,
      managed: readonly string[],
   ) => void;
   /** Where the controls start, from the host, e.g. a dashboard tile's values. */
   startingGivens?: Record<string, string>;
}

/**
 * ModelExplorer renders the main explorer UI for a Malloy model. It shows the
 * selected source (via `SourceExplorerComponent`) along with the list of named
 * queries for that model. This logic was originally embedded inside `Model.tsx`
 * but has been extracted for easier reuse.
 */
export function ModelExplorer({
   data,
   onChange,
   existingQuery,
   initialSelectedSourceIndex = 0,
   onSourceChange,
   resourceUri,
   givens,
   onGivensChange,
   startingGivens,
}: ModelExplorerProps) {
   const [selectedTab, setSelectedTab] = React.useState(
      initialSelectedSourceIndex,
   );

   // Update selectedTab when initialSelectedSourceIndex changes
   React.useEffect(() => {
      setSelectedTab(initialSelectedSourceIndex);
   }, [initialSelectedSourceIndex]);

   // If data is not provided, fetch it internally
   const {
      data: fetchedData,
      isError,
      isLoading,
      error,
   } = useModelData(resourceUri, !data); // we shld only fetch when data is not provided
   const { environmentName, packageName, modelPath, versionId } =
      parseResourceUri(resourceUri);

   const effectiveData = data || fetchedData;

   // Above the early returns, which would otherwise skip these hooks.
   const specs = React.useMemo(
      () => effectiveData?.givens ?? [],
      [effectiveData],
   );
   const controls = useDocumentControls({
      specs,
      loaded: !!effectiveData,
      params: givens,
      onGivensChange,
      startingValues: startingGivens,
      documentKey: resourceUri,
      // No Apply button: the Explorer already waits for an explicit Run.
      autorun: true,
      environmentName: environmentName ?? "",
      packageName: packageName ?? "",
      modelPath,
      versionId,
      documentName: modelPath,
   });
   const requestGivens = useMemo(
      () => givensToRequest(controls.applied, controls.declaredTypes),
      [controls.applied, controls.declaredTypes],
   );
   const gate = useMemo(
      () => runGate(specs, controls.applied),
      [specs, controls.applied],
   );
   const [mode, setMode] = React.useState<ExplorerMode>(storedMode);
   const changeMode = (next: ExplorerMode) => {
      setMode(next);
      try {
         window.localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch {
         // Storage can be unavailable; the choice then lasts for the page.
      }
   };
   const question = useMemo<QuestionContext>(
      () => ({
         givens: specs,
         controls: controls.panel,
         applied: controls.applied,
         sourceText: effectiveData?.sourceText,
      }),
      [specs, controls.panel, controls.applied, effectiveData?.sourceText],
   );
   // Parsed once per model, so each source keeps one identity across renders.
   const sourceAndPaths = useMemo(
      () =>
         (effectiveData?.sourceInfos ?? []).map((source) => ({
            sourceInfo: JSON.parse(source),
            modelPath: modelPath,
         })),
      [effectiveData?.sourceInfos, modelPath],
   );
   const selectSource = (idx: number) => {
      setSelectedTab(idx);
      onSourceChange?.(idx);
   };

   if (isLoading && !data) {
      return <Loading text="Fetching Model..." />;
   }

   if (isError && !data) {
      console.log("error", error);
      return (
         <ApiErrorDisplay
            error={error}
            context={`ModelExplorer > ${modelPath}`}
         />
      );
   }

   if (!effectiveData) {
      return <Loading text="Loading..." />;
   }

   const sourceOptions = (effectiveData?.sourceInfos || []).map(
      (source, idx) => {
         try {
            const parsed = JSON.parse(source);
            return parsed?.name || `Source ${idx + 1}`;
         } catch {
            return `Source ${idx + 1}`;
         }
      },
   );
   const selectedName = sourceOptions[selectedTab] || "";

   return (
      <StyledCard variant="outlined">
         <StyledCardContent sx={{ flexGrow: 0 }}>
            <Stack
               sx={{
                  flexDirection: "row",
               }}
            >
               {/* Render the tabs for source selection */}
               {/* {Array.isArray(effectiveData.sourceInfos) &&
                     effectiveData.sourceInfos.length > 0 && (
                        <MultiRowTabBar>
                           {effectiveData.sourceInfos.map((source, idx) => {
                              let sourceInfo;
                              try {
                                 sourceInfo = JSON.parse(source);
                              } catch {
                                 sourceInfo = { name: String(idx) };
                              }
                              return (
                                 <MultiRowTab
                                    key={sourceInfo.name || idx}
                                    selected={selectedTab === idx}
                                    onClick={() => {
                                       setSelectedTab(idx);
                                       if (onSourceChange) {
                                          onSourceChange(idx);
                                       }
                                    }}
                                 >
                                    {sourceInfo.name || `Source ${idx + 1}`}
                                 </MultiRowTab>
                              );
                           })}
                        </MultiRowTabBar>
                     )} */}
               <Autocomplete
                  size="small"
                  id="size-small-standard"
                  disablePortal
                  options={sourceOptions}
                  value={selectedName}
                  onChange={(_e, newValue) => {
                     if (!newValue) return;

                     const idx = sourceOptions.indexOf(newValue);
                     if (idx >= 0) selectSource(idx);
                  }}
                  renderInput={(params) => <TextField {...params} />}
                  style={{
                     width: 350,
                     marginTop: "3px",
                     marginLeft: "6px",
                     marginBottom: "8px",
                  }}
               />
               <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  // Beside the picker, not pushed right: hosts float their own
                  // icons in the card's top-right corner.
                  sx={{ ml: 2, mb: 1 }}
               >
                  <ToggleButtonGroup
                     size="small"
                     exclusive
                     value={mode}
                     onChange={(_event, next: ExplorerMode | null) =>
                        next && changeMode(next)
                     }
                     aria-label="Explorer mode"
                  >
                     <ToggleButton
                        value="fields"
                        sx={{ textTransform: "none" }}
                     >
                        Fields
                     </ToggleButton>
                     <ToggleButton
                        value="question"
                        sx={{ textTransform: "none" }}
                     >
                        Question
                     </ToggleButton>
                  </ToggleButtonGroup>
               </Stack>
            </Stack>
         </StyledCardContent>
         {/* Question mode shows each parameter beside the field it filters. */}
         {mode === "fields" && <GivensPanel {...controls.panel} />}
         <StyledCardMedia>
            <Stack
               spacing={2}
               component="section"
               sx={{
                  mt: mode === "question" ? "calc(6 * var(--mui-spacing))" : 0,
               }}
            >
               {/* Render the selected source info */}
               {sourceAndPaths.length > 0 && (
                  <SourcesExplorer
                     sourceAndPaths={sourceAndPaths}
                     selectedSourceIndex={selectedTab}
                     onSelectSource={selectSource}
                     existingQuery={existingQuery}
                     onQueryChange={onChange}
                     resourceUri={resourceUri}
                     givens={requestGivens}
                     gate={gate}
                     mode={mode}
                     question={question}
                  />
               )}

               <Box height="5px" />
            </Stack>
         </StyledCardMedia>
      </StyledCard>
   );
}
