// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import * as Malloy from "@malloydata/malloy-interfaces";
import type { Message } from "@malloydata/malloy-explorer";
import { Box, Stack } from "@mui/system";
import {
   StyledCardMedia,
   StyledExplorerContent,
   StyledExplorerPage,
} from "../styles";

import React, { useEffect, useState } from "react";
import type { Given } from "../../client";
import type { GivenValue } from "../../hooks/givenValue";
import { useMutationWithApiError } from "../../hooks/useQueryWithApiError";
import type { GivensPanelProps } from "../given/GivensPanel";
import { parseResourceUri } from "../../utils/formatting";
// import { ApiErrorDisplay } from "../ApiErrorDisplay";
import { flattenResult } from "../Publish/flattenResult";
import { usePublish } from "../Publish/PublishContext";
import { ResultHeaderPublish } from "../Publish/ResultHeaderPublish";
import { useServer } from "../ServerProvider";
import { questionFromQuery, queryFromQuestion } from "./Question/interchange";
import { type MeasureSource, QuestionPanel } from "./Question/QuestionPanel";
import {
   applicableBindings,
   buildQuestionQuery,
   deriveGivenBindings,
   emptyQuestionState,
   questionFields,
   type QuestionState,
} from "./Question/questionQuery";
import { missingGivensHint, type RunGate } from "./runGate";

/** `fields` is the explorer's own builder; `question` builds by answering questions. */
export type ExplorerMode = "fields" | "question";

/** What question mode needs from the host's control row. */
export interface QuestionContext {
   givens: Given[];
   controls: Omit<GivensPanelProps, "layout" | "title">;
   applied: ReadonlyMap<string, GivenValue>;
   /** The model file's text, read for the `where:` clauses that bind each given. */
   sourceText?: string;
}

type ExplorerComponents = typeof import("@malloydata/malloy-explorer");
type QueryBuilder = typeof import("@malloydata/malloy-query-builder");

export interface SourceAndPath {
   modelPath: string;
   sourceInfo: Malloy.SourceInfo;
}

export interface SourceExplorerProps {
   sourceAndPaths: SourceAndPath[];
   selectedSourceIndex: number;
   existingQuery?: QueryExplorerResult;
   onQueryChange?: (query: QueryExplorerResult) => void;
   onSourceChange?: (index: number) => void;
   /**
    * Selects another source from inside the explorer. Without it, question
    * mode offers only the selected source's measures.
    */
   onSelectSource?: (index: number) => void;
   resourceUri: string;
   /** The control row's current values, sent with every Run. */
   givens?: Record<string, unknown>;
   /** What the control row leaves unset, for the words around a result or a refusal. */
   gate?: RunGate;
   mode?: ExplorerMode;
   question?: QuestionContext;
}

/**
 * Component for Exploring a set of sources.
 * Sources are provided as a list of SourceAndPath objects where each entry
 * Maps from a model path to a source info object.
 * It is expected that multiple sourceInfo entries will correspond to the same
 * model path.
 */
export function SourcesExplorer({
   sourceAndPaths,
   selectedSourceIndex,
   existingQuery,
   onQueryChange,
   onSourceChange,
   onSelectSource,
   resourceUri,
   givens,
   gate,
   mode,
   question,
}: SourceExplorerProps) {
   // Notify parent component when selected source changes
   React.useEffect(() => {
      if (onSourceChange) {
         onSourceChange(selectedSourceIndex);
      }
   }, [selectedSourceIndex, onSourceChange]);

   const measureSources = React.useMemo<MeasureSource[]>(
      () =>
         sourceAndPaths.map(({ sourceInfo }, index) => ({
            index,
            name: sourceInfo.name,
            measures: questionFields(sourceInfo).filter(
               (field) => field.kind === "measure",
            ),
         })),
      [sourceAndPaths],
   );

   return (
      <StyledCardMedia>
         <Stack spacing={2} component="section">
            <SourceExplorerComponent
               sourceAndPath={sourceAndPaths[selectedSourceIndex]}
               measureSources={onSelectSource ? measureSources : undefined}
               onSelectSource={onSelectSource}
               existingQuery={existingQuery}
               onChange={(query) => {
                  if (onQueryChange) {
                     onQueryChange(query);
                  }
               }}
               resourceUri={resourceUri}
               givens={givens}
               gate={gate}
               mode={mode}
               question={question}
            />
            <Box height="5px" />
         </Stack>
      </StyledCardMedia>
   );
}

interface SourceExplorerComponentProps {
   sourceAndPath: SourceAndPath;
   /** Every source's measures, for question mode's first question. */
   measureSources?: MeasureSource[];
   onSelectSource?: (index: number) => void;
   existingQuery?: QueryExplorerResult;
   onChange?: (query: QueryExplorerResult) => void;
   resourceUri: string;
   givens?: Record<string, unknown>;
   gate?: RunGate;
   mode?: ExplorerMode;
   question?: QuestionContext;
}

export interface QueryExplorerResult {
   query: string | undefined;
   malloyQuery: Malloy.Query | string | undefined;
   malloyResult: Malloy.Result | undefined;
}

export function emptyQueryExplorerResult(): QueryExplorerResult {
   return {
      query: undefined,
      malloyQuery: undefined,
      malloyResult: undefined,
   };
}

/**
 * `result` with its Malloy text swapped for the builder's AST when the builder
 * can express it on `source`, so the query opens as fields rather than code.
 * Anything it cannot express, like a time-literal filter, stays as text.
 */
function inBuilder(
   result: QueryExplorerResult,
   source: Malloy.SourceInfo,
   explorer: ExplorerComponents,
   builder: QueryBuilder,
): QueryExplorerResult {
   const text = result.malloyQuery;
   if (typeof text !== "string") return result;
   try {
      const { query } = explorer.malloyToQuery(text);
      const definition = query?.definition;
      if (
         !query ||
         definition?.kind !== "arrow" ||
         definition.source.kind !== "source_reference" ||
         definition.source.name !== source.name
      ) {
         return result;
      }
      // Throws when the query names a field the source does not have.
      new builder.ASTQuery({ source, query }).toMalloy();
      return { ...result, malloyQuery: query };
   } catch {
      return result;
   }
}
function SourceExplorerComponentInner({
   sourceAndPath,
   measureSources,
   onSelectSource,
   onChange,
   existingQuery,
   explorerComponents,
   QueryBuilder,
   resourceUri,
   givens,
   gate,
   mode = "fields",
   question,
}: SourceExplorerComponentProps & {
   explorerComponents: ExplorerComponents;
   QueryBuilder: QueryBuilder;
   resourceUri: string;
}) {
   // One input, one output: the host echoes back what this explorer holds, and
   // two conversions of the same text would ping-pong between them forever.
   const conversionRef = React.useRef<
      { from: QueryExplorerResult; to: QueryExplorerResult } | undefined
   >(undefined);
   const toBuilder = (result: QueryExplorerResult) => {
      if (conversionRef.current?.from !== result) {
         conversionRef.current = {
            from: result,
            to: inBuilder(
               result,
               sourceAndPath.sourceInfo,
               explorerComponents,
               QueryBuilder,
            ),
         };
      }
      return conversionRef.current.to;
   };
   const [query, setQuery] = React.useState<QueryExplorerResult>(() =>
      existingQuery ? toBuilder(existingQuery) : emptyQueryExplorerResult(),
   );
   const queryRef = React.useRef(query);
   queryRef.current = query;
   const toBuilderRef = React.useRef(toBuilder);
   toBuilderRef.current = toBuilder;
   const [submittedQuery, setSubmittedQuery] = React.useState<
      | {
           executionState: "running" | "finished";
           response: {
              result?: Malloy.Result;
              messages?: Message[];
           };
           query: Malloy.Query | string;
           queryResolutionStartMillis: number;
           onCancel: () => void;
        }
      | undefined
   >(undefined);

   const fields = React.useMemo(
      () => questionFields(sourceAndPath.sourceInfo),
      [sourceAndPath.sourceInfo],
   );
   const bindings = React.useMemo(
      () =>
         deriveGivenBindings(
            question?.givens ?? [],
            question?.sourceText,
            fields,
         ),
      [question?.givens, question?.sourceText, fields],
   );
   const [questionState, setQuestionState] =
      React.useState<QuestionState>(emptyQuestionState);
   const [notCarried, setNotCarried] = React.useState<string[]>([]);
   const carryIntoQuestion = (
      malloyQuery: QueryExplorerResult["malloyQuery"],
   ) => {
      const carried = questionFromQuery(
         malloyQuery,
         sourceAndPath.sourceInfo,
         fields,
         bindings,
      );
      setQuestionState(carried?.state ?? emptyQuestionState());
      setNotCarried(carried?.notCarried ?? []);
   };

   // Update query when existingQuery changes. The host echoes back what this
   // explorer reported, which is kept as it is: converting that would pull
   // Malloy text being edited into the builder mid-keystroke.
   React.useEffect(() => {
      if (existingQuery) {
         const echo = existingQuery === queryRef.current;
         const next = echo
            ? existingQuery
            : toBuilderRef.current(existingQuery);
         setQuery(next);
         // An echo holds nothing new, and re-seeding from it would drop the
         // answers given since, such as a measure picked on another source.
         if (mode === "question" && !echo) carryIntoQuestion(next.malloyQuery);
      }
      // Only a new query from the host re-seeds the questions, not a mode change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [existingQuery]);

   // Each switch hands the other builder what this one held.
   const previousModeRef = React.useRef(mode);
   React.useEffect(() => {
      if (previousModeRef.current === mode) return;
      previousModeRef.current = mode;
      if (mode === "question") {
         carryIntoQuestion(query.malloyQuery);
      } else {
         setQuery({
            ...query,
            malloyQuery: queryFromQuestion(
               questionState,
               sourceAndPath.sourceInfo.name,
               fields,
            ),
            malloyResult: undefined,
         });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [mode]);
   const [focusedNestViewPath, setFocusedNestViewPath] = React.useState<
      string[]
   >([]);

   const {
      MalloyExplorerProvider,
      QueryActionBar,
      QueryPanel,
      ResizableCollapsiblePanel,
      ResultPanel,
      SourcePanel,
   } = explorerComponents;
   React.useEffect(() => {
      if (onChange) {
         onChange(query);
      }
   }, [onChange, query]);
   const {
      environmentName: environmentName,
      packageName: packageName,
      versionId: versionId,
   } = parseResourceUri(resourceUri);
   const { apiClients } = useServer();

   // Captured at Run, so the defaults note describes the run that produced the result.
   const gateAtRunRef = React.useRef<RunGate | undefined>(undefined);
   // Likewise what ran, so Publish sends the query behind the result on screen
   // rather than a draft edited since.
   const ranRef = React.useRef<
      { malloy: string; givens?: Record<string, unknown> } | undefined
   >(undefined);
   const publisher = usePublish();
   const [resultRoot, setResultRoot] = React.useState<HTMLDivElement | null>(
      null,
   );

   // Question mode runs as the reader answers, so an earlier, slower run can
   // land after a later one; only the answer to the current question is shown.
   const isSuperseded = (override: string | undefined) =>
      override !== undefined && override !== questionTextRef.current;

   // `override` is question mode's Malloy, run without replacing the builder's
   // query, so switching back to fields finds it as it was left.
   const mutation = useMutationWithApiError({
      mutationFn: (override: string | undefined) => {
         gateAtRunRef.current = gate;
         // Before building the Malloy, so a build that throws still has a run
         // for `onError` to report into.
         setSubmittedQuery({
            executionState: "running",
            query: override ?? query?.malloyQuery,
            queryResolutionStartMillis: Date.now(),
            onCancel: () => {
               mutation.reset();
               setSubmittedQuery(undefined);
            },
            response: {},
         });

         // If malloyQuery is a string, we can use it directly, otherwise convert to Malloy
         const malloy =
            override ??
            (typeof query?.malloyQuery === "string"
               ? query.malloyQuery
               : new QueryBuilder.ASTQuery({
                    source: sourceAndPath.sourceInfo,
                    query: query?.malloyQuery,
                 }).toMalloy());
         ranRef.current = { malloy, givens };

         if (override === undefined) {
            setQuery({
               ...query,
               query: malloy,
            });
         }
         return apiClients.models.executeQueryModel(
            environmentName,
            packageName,
            sourceAndPath.modelPath,
            {
               query: malloy,
               sourceName: undefined,
               queryName: undefined,
               versionId: versionId,
               // Omitted when empty, so a model with no givens sends the same body as before.
               ...(givens && Object.keys(givens).length > 0 ? { givens } : {}),
            },
         );
      },
      onSuccess: (data, override) => {
         if (isSuperseded(override)) return;
         if (data) {
            const parsedResult = JSON.parse(data.data.result);
            if (override === undefined) {
               setQuery({
                  ...query,
                  malloyResult: parsedResult as Malloy.Result,
               });
            }
            const ranGate = gateAtRunRef.current;
            // Update submitted query with results
            setSubmittedQuery((prev) =>
               prev
                  ? {
                       ...prev,
                       executionState: "finished",
                       response: {
                          result: parsedResult as Malloy.Result,
                          ...(ranGate?.defaultsNote
                             ? {
                                  messages: [
                                     {
                                        severity: "INFO",
                                        title: ranGate.defaultsNote,
                                     },
                                  ],
                               }
                             : {}),
                       },
                    }
                  : undefined,
            );
         }
      },
      onError: (error, override) => {
         if (isSuperseded(override)) return;
         console.error("Query execution error:", error);
         const message =
            (error as { data?: { message?: string } } | undefined)?.data
               ?.message ??
            (error as Error | undefined)?.message ??
            "The query could not be run.";
         const messages: Message[] = [{ severity: "ERROR", title: message }];
         // A gate's 403 names only the source, so say which blank givens it may want.
         const missing = gateAtRunRef.current?.missing ?? [];
         const refused =
            (error as { status?: number } | undefined)?.status === 403 ||
            /Access denied for source/i.test(message);
         if (refused && missing.length > 0) {
            messages.push({
               severity: "WARN",
               title: missingGivensHint(missing),
            });
         }
         // Shown in the results pane rather than cleared, so the server's
         // reason is visible. No run means Cancel cleared it: a late failure
         // from that request must not bring the pane back.
         setSubmittedQuery((prev) =>
            prev
               ? { ...prev, executionState: "finished", response: { messages } }
               : undefined,
         );
      },
   });

   const questionText = React.useMemo(
      () =>
         buildQuestionQuery({
            sourceName: sourceAndPath.sourceInfo.name,
            fields,
            state: questionState,
            bindings: applicableBindings(
               bindings,
               question?.givens ?? [],
               question?.applied ?? new Map(),
            ),
         }),
      [
         sourceAndPath.sourceInfo.name,
         fields,
         questionState,
         bindings,
         question?.givens,
         question?.applied,
      ],
   );
   const questionTextRef = React.useRef(questionText);
   questionTextRef.current = questionText;
   const runQuestionRef = React.useRef(() => {});
   runQuestionRef.current = () => {
      if (questionText) mutation.mutate(questionText);
   };
   // Keyed on the givens too, so changing a parameter re-runs the answer.
   const autoRunKey =
      mode === "question" && questionText
         ? `${questionText}\n${JSON.stringify(givens ?? {})}`
         : undefined;
   React.useEffect(() => {
      if (autoRunKey === undefined) return;
      const timer = setTimeout(() => runQuestionRef.current(), 350);
      return () => clearTimeout(timer);
   }, [autoRunKey]);
   // A measure on another source selects that source; the measure is held
   // here until the switch below lands, then becomes the first answer there.
   const pendingMeasureRef = React.useRef<
      { source: string; measure: string } | undefined
   >(undefined);
   const pickSourceMeasure = (index: number, measure: string) => {
      const target = measureSources?.[index];
      if (!target || !onSelectSource) return;
      pendingMeasureRef.current = { source: target.name, measure };
      onSelectSource(index);
   };
   const [oldSourceInfo, setOldSourceInfo] = React.useState(
      sourceAndPath.sourceInfo.name,
   );

   // This hack is needed since sourceInfo is updated before
   // query is reset, which results in the query not being found
   // because it does not exist on the new source.
   React.useEffect(() => {
      if (oldSourceInfo !== sourceAndPath.sourceInfo.name) {
         setOldSourceInfo(sourceAndPath.sourceInfo.name);
         setQuery(emptyQueryExplorerResult());
         const pending = pendingMeasureRef.current;
         pendingMeasureRef.current = undefined;
         setQuestionState((previous) =>
            pending?.source === sourceAndPath.sourceInfo.name
               ? {
                    ...emptyQuestionState(),
                    chart: previous.chart,
                    limit: previous.limit,
                    measure: pending.measure,
                 }
               : emptyQuestionState(),
         );
         setNotCarried([]);
         setSubmittedQuery(undefined);
      }
   }, [sourceAndPath, oldSourceInfo]);

   const onQueryChange = React.useCallback(
      (malloyQuery: Malloy.Query | string | undefined) => {
         setQuery({ ...query, malloyQuery, malloyResult: undefined });
      },
      [query],
   );

   // Runs the builder's query, AST or Malloy text alike.
   const runBuilderQuery = () => {
      console.log(`running query with:  ${query?.malloyQuery}`);
      try {
         mutation.mutate(undefined);
      } catch (error) {
         console.error("Error running query:", error);
      }
   };

   const publishable =
      submittedQuery?.executionState === "finished"
         ? submittedQuery.response.result
         : undefined;
   const onPublish =
      publisher && publishable && ranRef.current
         ? () =>
              publisher.publish({
                 kind: "query",
                 environmentName,
                 packageName,
                 modelPath: sourceAndPath.modelPath,
                 sourceName: sourceAndPath.sourceInfo.name,
                 malloy: ranRef.current!.malloy,
                 givens: ranRef.current!.givens,
                 result: flattenResult(publishable),
              })
         : undefined;

   if (oldSourceInfo !== sourceAndPath.sourceInfo.name) {
      return <div>Loading...</div>;
   }
   return (
      <StyledExplorerContent
         key={sourceAndPath.sourceInfo.name}
         sx={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            overflow: "hidden",
         }}
      >
         <MalloyExplorerProvider
            source={sourceAndPath.sourceInfo}
            query={query?.malloyQuery}
            topValues={[]}
            onFocusedNestViewPathChange={setFocusedNestViewPath}
            focusedNestViewPath={focusedNestViewPath}
            onQueryChange={onQueryChange}
         >
            <div
               style={{
                  display: "flex",
                  height: "100%",
                  overflowY: "auto",
               }}
            >
               {mode === "question" ? (
                  <ResizableCollapsiblePanel
                     isInitiallyExpanded={true}
                     initialWidth={360}
                     minWidth={300}
                     icon="filterSliders"
                     title="Question"
                  >
                     <QuestionPanel
                        sourceName={sourceAndPath.sourceInfo.name}
                        fields={fields}
                        measureSources={measureSources}
                        onPickSourceMeasure={pickSourceMeasure}
                        state={questionState}
                        onChange={setQuestionState}
                        givens={question?.givens ?? []}
                        bindings={bindings}
                        controls={
                           question?.controls ?? {
                              givens: [],
                              values: new Map(),
                              onChange: () => {},
                              onReset: () => {},
                           }
                        }
                        environmentName={environmentName}
                        packageName={packageName}
                        modelPath={sourceAndPath.modelPath}
                        versionId={versionId}
                        requestGivens={givens}
                        onRun={() => runQuestionRef.current()}
                        running={mutation.isPending}
                        canRun={questionText !== undefined}
                        notCarried={notCarried}
                        onDismissNotCarried={() => setNotCarried([])}
                     />
                  </ResizableCollapsiblePanel>
               ) : (
                  <>
                     <ResizableCollapsiblePanel
                        isInitiallyExpanded={true}
                        initialWidth={180}
                        minWidth={180}
                        icon="database"
                        title={sourceAndPath.sourceInfo.name}
                     >
                        <SourcePanel
                           onRefresh={() =>
                              setQuery(emptyQueryExplorerResult())
                           }
                        />
                     </ResizableCollapsiblePanel>
                     <ResizableCollapsiblePanel
                        isInitiallyExpanded={true}
                        initialWidth={280}
                        minWidth={280}
                        icon="filterSliders"
                        title="Query"
                     >
                        {typeof query?.malloyQuery === "string" ? (
                           // The explorer's own code editor needs a Monaco
                           // host and renders blank without one.
                           <Stack sx={{ height: "100%" }}>
                              <QueryActionBar
                                 runQuery={runBuilderQuery}
                                 runQueryString={runBuilderQuery}
                              />
                              <Box
                                 component="textarea"
                                 aria-label="Malloy query"
                                 spellCheck={false}
                                 value={query.malloyQuery}
                                 onChange={(
                                    event: React.ChangeEvent<HTMLTextAreaElement>,
                                 ) => onQueryChange(event.target.value)}
                                 sx={{
                                    flex: 1,
                                    minHeight: 240,
                                    m: "0 12px 12px",
                                    p: 1,
                                    fontFamily: "monospace",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    resize: "none",
                                    border: "1px solid #e0e0e0",
                                    borderRadius: "6px",
                                    background: "transparent",
                                    color: "inherit",
                                 }}
                              />
                           </Stack>
                        ) : (
                           <QueryPanel
                              runQuery={runBuilderQuery}
                              runQueryString={runBuilderQuery}
                           />
                        )}
                     </ResizableCollapsiblePanel>
                  </>
               )}
               {/* `contents` so the wrapper adds no box to the explorer's flex row. */}
               <div ref={setResultRoot} style={{ display: "contents" }}>
                  <ResultPanel
                     source={sourceAndPath.sourceInfo}
                     draftQuery={
                        mode === "question" ? questionText : query?.malloyQuery
                     }
                     setDraftQuery={(malloyQuery) => {
                        if (mode === "question") return;
                        setQuery({ ...query, malloyQuery: malloyQuery });
                     }}
                     submittedQuery={submittedQuery}
                     options={{ showRawQuery: true }}
                  />
               </div>
               <ResultHeaderPublish
                  root={publisher ? resultRoot : null}
                  label={publisher?.label}
                  onPublish={onPublish}
               />
            </div>
         </MalloyExplorerProvider>
      </StyledExplorerContent>
   );
}

// Lazy-loaded wrapper component
export function SourceExplorerComponent(props: SourceExplorerComponentProps) {
   const [explorerComponents, setExplorerComponents] =
      useState<ExplorerComponents | null>(null);
   const [QueryBuilder, setQueryBuilder] = useState<QueryBuilder | null>(null);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      let isMounted = true;

      Promise.all([
         import("@malloydata/malloy-explorer"),
         import("@malloydata/malloy-query-builder"),
      ])
         .then(([explorerComponents, queryBuilder]) => {
            if (isMounted) {
               setExplorerComponents(explorerComponents);
               setQueryBuilder(queryBuilder);
               setLoading(false);
            }
         })
         .catch((error) => {
            console.error("Failed to load Malloy components:", error);
            if (isMounted) {
               setLoading(false);
            }
         });

      return () => {
         isMounted = false;
      };
   }, []);

   if (loading || !explorerComponents || !QueryBuilder) {
      return (
         <StyledExplorerPage>
            <StyledExplorerContent>
               <Box
                  sx={{
                     alignItems: "center",
                     justifyContent: "center",
                     height: "200px",
                     color: "text.secondary",
                  }}
               >
                  Loading explorer...
               </Box>
            </StyledExplorerContent>
         </StyledExplorerPage>
      );
   }

   return (
      <SourceExplorerComponentInner
         {...props}
         explorerComponents={explorerComponents}
         QueryBuilder={QueryBuilder}
         resourceUri={props.resourceUri}
      />
   );
}
