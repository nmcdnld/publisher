// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from "react";

/*
 * Workspaces are independent demo setups: each has its own branding (name and
 * logo), its own fixture data, and its own workspace theme, so one story can
 * be prepared without disturbing another. Everything lives in localStorage;
 * per-workspace keys are the base key suffixed with the workspace id, except
 * for the default workspace, which keeps the bare keys older builds wrote.
 */

const STORAGE_WORKSPACES = "destination.workspaces";
const STORAGE_ACTIVE = "destination.active-workspace";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_BRAND_NAME = "Credible";

export interface Workspace {
   id: string;
   /** Replaces "Credible" in the sidebar when set. */
   name?: string;
   /** A data URL; replaces the sidebar mark when set. */
   logo?: string;
   /**
    * The Publisher packages this workspace shows. Unset shows every package
    * the environment serves, including ones added later.
    */
   packages?: string[];
}

export interface WorkspacesState {
   workspaces: Workspace[];
   active: Workspace;
}

function readWorkspaces(): Workspace[] {
   let saved: Workspace[] = [];
   try {
      const parsed = JSON.parse(
         localStorage.getItem(STORAGE_WORKSPACES) ?? "[]",
      );
      if (Array.isArray(parsed)) saved = parsed;
   } catch {
      // A corrupt store falls back to the default workspace alone.
   }
   return saved.some((w) => w.id === DEFAULT_WORKSPACE_ID)
      ? saved
      : [{ id: DEFAULT_WORKSPACE_ID }, ...saved];
}

function resolve(workspaces: Workspace[], activeId: string): WorkspacesState {
   return {
      workspaces,
      active:
         workspaces.find((w) => w.id === activeId) ??
         workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)!,
   };
}

let state: WorkspacesState | null = null;
const listeners = new Set<() => void>();

function current(): WorkspacesState {
   state ??= resolve(
      readWorkspaces(),
      localStorage.getItem(STORAGE_ACTIVE) ?? DEFAULT_WORKSPACE_ID,
   );
   return state;
}

function commit(workspaces: Workspace[]) {
   try {
      localStorage.setItem(STORAGE_WORKSPACES, JSON.stringify(workspaces));
   } catch {
      // Memory still works for the session when storage is full or blocked.
   }
   state = resolve(workspaces, current().active.id);
   for (const l of listeners) l();
}

/** The storage key for `base` in the active workspace. */
export function workspaceKey(base: string, id = current().active.id): string {
   return id === DEFAULT_WORKSPACE_ID ? base : `${base}.${id}`;
}

export function workspaceLabel(w: Workspace): string {
   return w.name?.trim() || DEFAULT_BRAND_NAME;
}

/** The workspace this page load is in, outside React. */
export const activeWorkspace = (): Workspace => current().active;

export function showsPackage(w: Workspace, pkg: string): boolean {
   return !w.packages || w.packages.includes(pkg);
}

/**
 * The fixture client and query cache are built once per page load, so a
 * switch reloads into the other workspace rather than swapping in place.
 */
export function switchWorkspace(id: string) {
   localStorage.setItem(STORAGE_ACTIVE, id);
   window.location.reload();
}

export function createWorkspace(name: string) {
   const workspace: Workspace = {
      id: `ws-${Date.now().toString(36)}`,
      name: name.trim() || undefined,
   };
   commit([...current().workspaces, workspace]);
   switchWorkspace(workspace.id);
}

export function updateWorkspace(
   id: string,
   patch: Partial<Omit<Workspace, "id">>,
) {
   commit(
      current().workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
   );
}

/** Deletes a workspace and the data and theme it stored. */
export function deleteWorkspace(id: string, storageBases: string[]) {
   if (id === DEFAULT_WORKSPACE_ID) return;
   for (const base of storageBases) {
      localStorage.removeItem(workspaceKey(base, id));
   }
   const wasActive = current().active.id === id;
   commit(current().workspaces.filter((w) => w.id !== id));
   if (wasActive) switchWorkspace(DEFAULT_WORKSPACE_ID);
}

function subscribe(listener: () => void) {
   listeners.add(listener);
   return () => listeners.delete(listener);
}

export function useWorkspaces(): WorkspacesState {
   return useSyncExternalStore(subscribe, current);
}

/**
 * Reads an image file as a data URL small enough for localStorage: raster
 * images are scaled to fit `size` pixels; SVGs are kept as they are.
 */
export async function readLogoFile(file: File, size = 128): Promise<string> {
   const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
   });
   if (file.type === "image/svg+xml") return dataUrl;
   const img = new Image();
   img.src = dataUrl;
   await img.decode();
   const scale = Math.min(1, size / Math.max(img.width, img.height));
   const canvas = document.createElement("canvas");
   canvas.width = Math.round(img.width * scale);
   canvas.height = Math.round(img.height * scale);
   canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
   return canvas.toDataURL("image/png");
}
