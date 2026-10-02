// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
   Alert,
   Autocomplete,
   Box,
   Button,
   Chip,
   Collapse,
   MenuItem,
   Stack,
   TextField,
   ToggleButton,
   ToggleButtonGroup,
   Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import type { Given } from "../../../client";
import type { GivenValue } from "../../../hooks/givenValue";
import {
   buildSuggestQuery,
   readOptionValues,
} from "../../../hooks/useSuggestOptions";
import { GivenInput } from "../../given";
import type { GivensPanelProps } from "../../given/GivensPanel";
import { useServer } from "../../ServerProvider";
import {
   canMap,
   type ChartChoice,
   type GivenBinding,
   GRAINS,
   type Grain,
   isTemporal,
   type QuestionField,
   type QuestionState,
   resolvedChart,
} from "./questionQuery";

/** One source's measures, for a first question that ranges over the model. */
export interface MeasureSource {
   index: number;
   name: string;
   measures: QuestionField[];
}

export interface QuestionPanelProps {
   sourceName: string;
   fields: QuestionField[];
   /**
    * Every source's measures. Picking one on another source calls
    * `onPickSourceMeasure` rather than `onChange`, since the rest of the
    * question has to be asked of that source.
    */
   measureSources?: MeasureSource[];
   onPickSourceMeasure?: (sourceIndex: number, path: string) => void;
   state: QuestionState;
   onChange: (next: QuestionState) => void;
   givens: Given[];
   bindings: ReadonlyMap<string, GivenBinding>;
   controls: Omit<GivensPanelProps, "layout" | "title">;
   environmentName: string;
   packageName: string;
   modelPath: string;
   versionId?: string;
   /** Encoded givens, sent with a derived filter's option query. */
   requestGivens?: Record<string, unknown>;
   onRun: () => void;
   running: boolean;
   canRun: boolean;
   /** What switching from Fields could not place in a slot. */
   notCarried?: string[];
   onDismissNotCarried?: () => void;
}

function FieldOption({ field }: { field: QuestionField }) {
   return (
      <Stack sx={{ minWidth: 0 }}>
         <Typography variant="body2" noWrap>
            {field.label}
         </Typography>
         <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ fontFamily: "monospace" }}
         >
            {field.path}
            {field.kind === "dimension" && field.type !== "string"
               ? ` · ${field.type}`
               : ""}
         </Typography>
      </Stack>
   );
}

function FieldPicker({
   options,
   value,
   onChange,
   placeholder,
   disabled,
}: {
   options: QuestionField[];
   value: string | undefined;
   onChange: (path: string | undefined) => void;
   placeholder: string;
   disabled?: boolean;
}) {
   const selected = options.find((option) => option.path === value) ?? null;
   return (
      <Autocomplete
         size="small"
         options={options}
         value={selected}
         disabled={disabled}
         groupBy={(option) => option.group}
         getOptionLabel={(option) => option.label}
         isOptionEqualToValue={(a, b) => a.path === b.path}
         onChange={(_event, next) => onChange(next?.path)}
         renderOption={(optionProps, option) => {
            const { key, ...rest } = optionProps as typeof optionProps & {
               key: string;
            };
            return (
               <li key={key} {...rest}>
                  <FieldOption field={option} />
               </li>
            );
         }}
         renderInput={(params) => (
            <TextField {...params} placeholder={placeholder} />
         )}
      />
   );
}

interface MeasureOption {
   sourceIndex: number;
   sourceName: string;
   group: string;
   field: QuestionField;
}

function measureOptions(sources: MeasureSource[]): MeasureOption[] {
   return sources.flatMap((source) => {
      // Grouped by join within each source, so every heading appears once.
      const groups = [...new Set(source.measures.map((m) => m.group))];
      return groups.flatMap((group) =>
         source.measures
            .filter((field) => field.group === group)
            .map((field) => ({
               sourceIndex: source.index,
               sourceName: source.name,
               group:
                  group === source.name
                     ? source.name
                     : `${source.name} › ${group}`,
               field,
            })),
      );
   });
}

/** The first question, asked of every source: picking a measure picks its source. */
function MeasurePicker({
   sources,
   sourceName,
   value,
   onChange,
   onPickSourceMeasure,
}: {
   sources: MeasureSource[];
   sourceName: string;
   value: string | undefined;
   onChange: (path: string | undefined) => void;
   onPickSourceMeasure: (sourceIndex: number, path: string) => void;
}) {
   const options = React.useMemo(() => measureOptions(sources), [sources]);
   const selected =
      options.find(
         (option) =>
            option.sourceName === sourceName && option.field.path === value,
      ) ?? null;
   return (
      <Autocomplete
         size="small"
         options={options}
         value={selected}
         groupBy={(option) => option.group}
         getOptionLabel={(option) => option.field.label}
         // Typing a source's name finds its measures, not only a measure's own.
         filterOptions={(all, { inputValue }) => {
            const needle = inputValue.trim().toLowerCase();
            if (!needle) return all;
            return all.filter((option) =>
               [option.field.label, option.field.path, option.group].some(
                  (text) => text.toLowerCase().includes(needle),
               ),
            );
         }}
         isOptionEqualToValue={(a, b) =>
            a.sourceIndex === b.sourceIndex && a.field.path === b.field.path
         }
         onChange={(_event, next) => {
            if (!next) onChange(undefined);
            else if (next.sourceName === sourceName) onChange(next.field.path);
            else onPickSourceMeasure(next.sourceIndex, next.field.path);
         }}
         renderOption={(optionProps, option) => {
            const { key, ...rest } = optionProps as typeof optionProps & {
               key: string;
            };
            return (
               <li key={key} {...rest}>
                  <FieldOption field={option.field} />
               </li>
            );
         }}
         renderInput={(params) => (
            <TextField
               {...params}
               placeholder={
                  options.length > 0
                     ? "Choose a measure"
                     : "This model has no measures"
               }
            />
         )}
      />
   );
}

function GrainPicker({
   value,
   onChange,
}: {
   value: Grain;
   onChange: (grain: Grain) => void;
}) {
   return (
      <TextField
         select
         size="small"
         value={value}
         onChange={(event) => onChange(event.target.value as Grain)}
         sx={{ minWidth: 110 }}
         label="By"
      >
         {GRAINS.map((grain) => (
            <MenuItem key={grain} value={grain}>
               {grain}
            </MenuItem>
         ))}
      </TextField>
   );
}

function Step({
   number,
   question,
   hint,
   disabled,
   children,
}: {
   number: number;
   question: string;
   hint?: string;
   disabled?: boolean;
   children: React.ReactNode;
}) {
   return (
      <Stack spacing={1} sx={{ opacity: disabled ? 0.5 : 1 }}>
         <Stack direction="row" spacing={1} alignItems="baseline">
            <Box
               sx={{
                  flex: "0 0 auto",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: disabled ? "action.disabled" : "primary.main",
                  color: "primary.contrastText",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
               }}
            >
               {number}
            </Box>
            <Box>
               <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {question}
               </Typography>
               {hint && (
                  <Typography variant="caption" color="text.secondary">
                     {hint}
                  </Typography>
               )}
            </Box>
         </Stack>
         <Box sx={{ pl: 3.5 }}>{children}</Box>
      </Stack>
   );
}

/** A value filter on a chosen dimension no parameter covers. */
function DerivedFilter({
   field,
   values,
   onChange,
   sourceName,
   environmentName,
   packageName,
   modelPath,
   versionId,
   requestGivens,
   caption,
}: {
   field: QuestionField;
   values: string[];
   onChange: (values: string[]) => void;
   caption: string;
} & Pick<
   QuestionPanelProps,
   | "sourceName"
   | "environmentName"
   | "packageName"
   | "modelPath"
   | "versionId"
   | "requestGivens"
>) {
   const { apiClients } = useServer();
   const options = useQuery({
      queryKey: [
         "questionFilterValues",
         environmentName,
         packageName,
         versionId,
         modelPath,
         sourceName,
         field.path,
         requestGivens === undefined ? null : JSON.stringify(requestGivens),
      ],
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      queryFn: async () => {
         const response = await apiClients.models.executeQueryModel(
            environmentName,
            packageName,
            modelPath,
            {
               query: buildSuggestQuery(sourceName, field.path),
               compactJson: true,
               versionId,
               givens: requestGivens,
            },
         );
         return readOptionValues(response.data.result, field.name);
      },
   });
   return (
      <Autocomplete
         multiple
         size="small"
         options={options.data ?? []}
         loading={options.isLoading}
         value={values}
         onChange={(_event, next) => onChange(next)}
         limitTags={3}
         renderInput={(params) => (
            <TextField
               {...params}
               label={field.label}
               placeholder={values.length === 0 ? "All" : undefined}
               helperText={options.isError ? "Values unavailable" : caption}
            />
         )}
      />
   );
}

function Section({
   title,
   count,
   note,
   initiallyOpen,
   children,
}: {
   title: string;
   count?: number;
   note?: string;
   initiallyOpen: boolean;
   children: React.ReactNode;
}) {
   const [open, setOpen] = React.useState(initiallyOpen);
   return (
      <Box>
         <Button
            size="small"
            onClick={() => setOpen(!open)}
            endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{
               textTransform: "none",
               px: 0,
               color: "text.primary",
               fontWeight: 600,
            }}
         >
            {title}
            {count !== undefined && (
               <Chip label={count} size="small" sx={{ ml: 1, height: 18 }} />
            )}
         </Button>
         <Collapse in={open}>
            {note && (
               <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mb: 1 }}
               >
                  {note}
               </Typography>
            )}
            <Stack spacing={2}>{children}</Stack>
         </Collapse>
      </Box>
   );
}

/**
 * The explorer's question mode: a measure, a grouping and a segment chosen by
 * answering questions rather than by dragging fields, with the parameters and
 * filters that bear on the chosen fields shown beneath them.
 */
export function QuestionPanel({
   sourceName,
   fields,
   measureSources,
   onPickSourceMeasure,
   state,
   onChange,
   givens,
   bindings,
   controls,
   environmentName,
   packageName,
   modelPath,
   versionId,
   requestGivens,
   onRun,
   running,
   canRun,
   notCarried = [],
   onDismissNotCarried,
}: QuestionPanelProps) {
   const measures = fields.filter((field) => field.kind === "measure");
   const dimensions = fields.filter((field) => field.kind === "dimension");
   const find = (path: string | undefined) =>
      fields.find((field) => field.path === path);
   const group = find(state.groupBy);
   const segment = find(state.segment);

   const selected = new Set(
      [state.groupBy, state.segment].filter((p): p is string => !!p),
   );
   // An emptied value filter goes with the field it was offered for; one that
   // holds values stays, and stays listed, so nothing filters out of sight.
   const keepFilters = (keep: Set<string>) =>
      Object.fromEntries(
         Object.entries(state.filters).filter(
            ([path, values]) => keep.has(path) || values.length > 0,
         ),
      );

   const setGroup = (path: string | undefined) => {
      const segmentPath =
         path && state.segment !== path ? state.segment : undefined;
      onChange({
         ...state,
         groupBy: path,
         segment: segmentPath,
         filters: keepFilters(
            new Set([path, segmentPath].filter((p): p is string => !!p)),
         ),
      });
   };
   const setSegment = (path: string | undefined) =>
      onChange({
         ...state,
         segment: path,
         filters: keepFilters(
            new Set([state.groupBy, path].filter((p): p is string => !!p)),
         ),
      });

   const yours: Given[] = [];
   const more: Given[] = [];
   const other: Given[] = [];
   for (const given of givens) {
      const binding = given.name ? bindings.get(given.name) : undefined;
      if (binding && selected.has(binding.field)) yours.push(given);
      else if (binding) more.push(given);
      else other.push(given);
   }
   const covered = new Set([...bindings.values()].map((b) => b.field));
   const derived = [
      ...[group, segment].filter(
         (field): field is QuestionField =>
            !!field && field.type === "string" && !covered.has(field.path),
      ),
      ...Object.entries(state.filters)
         .filter(([path, values]) => values.length > 0 && !selected.has(path))
         .map(([path]) => find(path))
         .filter((field): field is QuestionField => !!field),
   ];
   const setCount = (list: Given[]) =>
      list.filter(
         (given) =>
            given.name !== undefined &&
            controls.values.get(given.name) !== null &&
            controls.values.get(given.name) !== undefined,
      ).length;

   const renderGiven = (given: Given) => (
      <Box key={given.name}>
         <GivenInput
            given={given}
            value={given.name ? controls.values.get(given.name) : undefined}
            onChange={(next: GivenValue) =>
               given.name && controls.onChange(given.name, next)
            }
            options={given.name ? controls.options?.get(given.name) : undefined}
            optionsLoading={controls.optionsLoading}
            optionsFailed={
               given.name ? controls.optionsFailed?.has(given.name) : undefined
            }
         />
         {given.name && bindings.get(given.name) && (
            <Typography
               variant="caption"
               color="text.secondary"
               sx={{ fontFamily: "monospace" }}
            >
               {bindings.get(given.name)!.field}{" "}
               {bindings.get(given.name)!.operator} ${given.name}
            </Typography>
         )}
      </Box>
   );

   const chart = resolvedChart(state, group);

   return (
      <Stack
         spacing={3}
         sx={{
            p: 2,
            overflowY: "auto",
            height: "100%",
            boxSizing: "border-box",
         }}
      >
         {notCarried.length > 0 && (
            <Alert
               severity="info"
               onClose={onDismissNotCarried}
               sx={{ fontSize: 13 }}
            >
               Not carried over from Fields: {notCarried.join("; ")}.
            </Alert>
         )}
         <Step
            number={1}
            question="What would you like to measure?"
            hint={
               measureSources && measureSources.length > 1
                  ? "From any source: picking one switches to it"
                  : undefined
            }
         >
            {measureSources && onPickSourceMeasure ? (
               <MeasurePicker
                  sources={measureSources}
                  sourceName={sourceName}
                  value={state.measure}
                  onChange={(measure) => onChange({ ...state, measure })}
                  onPickSourceMeasure={onPickSourceMeasure}
               />
            ) : (
               <FieldPicker
                  options={measures}
                  value={state.measure}
                  onChange={(measure) => onChange({ ...state, measure })}
                  placeholder={
                     measures.length > 0
                        ? "Choose a measure"
                        : "This source has no measures"
                  }
               />
            )}
         </Step>

         <Step
            number={2}
            question="What would you like to group by?"
            hint={
               state.measure
                  ? "Optional: leave empty for one number"
                  : undefined
            }
            disabled={!state.measure}
         >
            <Stack direction="row" spacing={1}>
               <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FieldPicker
                     options={dimensions}
                     value={state.groupBy}
                     onChange={setGroup}
                     placeholder="Choose a dimension"
                     disabled={!state.measure}
                  />
               </Box>
               {isTemporal(group) && !group?.truncated && (
                  <GrainPicker
                     value={state.groupGrain ?? "month"}
                     onChange={(groupGrain) =>
                        onChange({ ...state, groupGrain })
                     }
                  />
               )}
            </Stack>
         </Step>

         <Step
            number={3}
            question="What would you like to segment by?"
            hint={group ? "Optional: splits each group into series" : undefined}
            disabled={!group}
         >
            <Stack direction="row" spacing={1}>
               <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FieldPicker
                     options={dimensions.filter(
                        (field) => field.path !== state.groupBy,
                     )}
                     value={state.segment}
                     onChange={setSegment}
                     placeholder="Choose a dimension"
                     disabled={!group}
                  />
               </Box>
               {isTemporal(segment) && !segment?.truncated && (
                  <GrainPicker
                     value={state.segmentGrain ?? "year"}
                     onChange={(segmentGrain) =>
                        onChange({ ...state, segmentGrain })
                     }
                  />
               )}
            </Stack>
         </Step>

         <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
               Show it as
            </Typography>
            <ToggleButtonGroup
               size="small"
               exclusive
               value={state.chart}
               onChange={(_event, next: ChartChoice | null) =>
                  next && onChange({ ...state, chart: next })
               }
            >
               <ToggleButton value="auto" sx={{ textTransform: "none" }}>
                  Auto
                  {state.chart === "auto" && state.measure
                     ? ` (${chart.replace("_", " ")})`
                     : ""}
               </ToggleButton>
               <ToggleButton value="bar" sx={{ textTransform: "none" }}>
                  Bar
               </ToggleButton>
               <ToggleButton value="line" sx={{ textTransform: "none" }}>
                  Line
               </ToggleButton>
               <ToggleButton value="table" sx={{ textTransform: "none" }}>
                  Table
               </ToggleButton>
               <ToggleButton
                  value="map"
                  disabled={!canMap(state, group) && state.chart !== "map"}
                  title="A shape map: one grouping, such as US states, and no segment"
                  sx={{ textTransform: "none" }}
               >
                  Map
               </ToggleButton>
            </ToggleButtonGroup>
            {state.chart === "map" && chart !== "map" && (
               <Typography variant="caption" color="text.secondary">
                  A map needs one text grouping and no segment, so this shows as
                  a {chart.replace("_", " ")}.
               </Typography>
            )}
            {group && !isTemporal(group) && chart !== "map" && (
               <TextField
                  select
                  size="small"
                  label="Top"
                  value={state.limit}
                  onChange={(event) =>
                     onChange({ ...state, limit: Number(event.target.value) })
                  }
                  sx={{ width: 110 }}
               >
                  {[...new Set([5, 10, 20, 50, 100, state.limit])]
                     .sort((a, b) => a - b)
                     .map((n) => (
                        <MenuItem key={n} value={n}>
                           {n}
                        </MenuItem>
                     ))}
               </TextField>
            )}
         </Stack>

         <Stack spacing={1.5}>
            <Section
               title="Filters on your fields"
               count={yours.length + derived.length}
               initiallyOpen
               note={
                  yours.length + derived.length === 0
                     ? "Choose a group-by or segment to see the filters that apply to it."
                     : undefined
               }
            >
               {yours.map(renderGiven)}
               {derived.map((field) => (
                  <DerivedFilter
                     key={field.path}
                     field={field}
                     values={state.filters[field.path] ?? []}
                     onChange={(values) =>
                        onChange({
                           ...state,
                           filters: { ...state.filters, [field.path]: values },
                        })
                     }
                     sourceName={sourceName}
                     environmentName={environmentName}
                     packageName={packageName}
                     modelPath={modelPath}
                     versionId={versionId}
                     requestGivens={requestGivens}
                     caption={
                        selected.has(field.path)
                           ? "Derived from your group-by"
                           : `Filters ${field.path}`
                     }
                  />
               ))}
            </Section>
            {more.length > 0 && (
               <Section
                  title={`More filters on ${sourceName}`}
                  count={more.length}
                  initiallyOpen={false}
                  note={
                     setCount(more) > 0
                        ? `${setCount(more)} set. Every filter here applies to the result, open or not.`
                        : "Every filter here applies to the result, open or not."
                  }
               >
                  {more.map(renderGiven)}
               </Section>
            )}
            {other.length > 0 && (
               <Section
                  title="Other parameters"
                  count={other.length}
                  initiallyOpen={false}
                  note="Sent with the query, but no field here names them. They apply only if the source reads them itself."
               >
                  {other.map(renderGiven)}
               </Section>
            )}
         </Stack>

         <Box>
            <Button
               variant="contained"
               size="small"
               disableElevation
               startIcon={<PlayArrowIcon />}
               onClick={onRun}
               disabled={!canRun || running}
               sx={{ textTransform: "none" }}
            >
               {running ? "Running…" : "Run"}
            </Button>
            <Typography
               variant="caption"
               color="text.secondary"
               sx={{ ml: 1.5 }}
            >
               Runs as you answer
            </Typography>
         </Box>
      </Stack>
   );
}
