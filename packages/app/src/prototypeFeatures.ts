// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from "react";

/**
 * Console modules that can be switched off per browser, so a demo can show
 * the Console with or without them. Both default to on.
 */
export type PrototypeFeature = "dataDictionary" | "questionCoverage";

export const PROTOTYPE_FEATURES: Array<{
   id: PrototypeFeature;
   label: string;
   description: string;
}> = [
   {
      id: "dataDictionary",
      label: "Data Dictionary",
      description: "A page for every source, measure, view and given",
   },
   {
      id: "questionCoverage",
      label: "Question coverage",
      description: "How many asked questions the model can answer",
   },
];

type FeatureState = Record<PrototypeFeature, boolean>;

const STORAGE_KEY = "malloy-publisher:prototype-features";
const DEFAULTS: FeatureState = { dataDictionary: true, questionCoverage: true };

function load(): FeatureState {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
   } catch {
      return DEFAULTS;
   }
}

const listeners = new Set<() => void>();
let state: FeatureState = load();

function subscribe(listener: () => void) {
   listeners.add(listener);
   return () => listeners.delete(listener);
}

export function usePrototypeFeatures(): FeatureState {
   return useSyncExternalStore(subscribe, () => state);
}

export function usePrototypeFeature(feature: PrototypeFeature): boolean {
   return usePrototypeFeatures()[feature];
}

/** For code outside React, read at the moment it runs. */
export function isPrototypeFeatureEnabled(feature: PrototypeFeature): boolean {
   return state[feature];
}

export function setPrototypeFeature(feature: PrototypeFeature, on: boolean) {
   state = { ...state, [feature]: on };
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
   } catch {
      // Private mode or a full quota: the toggle still holds for this tab.
   }
   listeners.forEach((l) => l());
}
