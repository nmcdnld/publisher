// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import { indexHtmlFor } from "@malloy-publisher/app-manifest";
import {
   BadRequestError,
   CompileRefusedError,
   DataAppNotFoundError,
   FrozenConfigError,
   WriteConflictError,
} from "../errors";
import type { EnvironmentStore } from "../service/environment_store";
import { contentHashOf } from "./dashboard.controller";
import { DataAppController } from "./data_app.controller";

/**
 * The data app write, against a stubbed environment and a real package
 * directory: the refusals that happen before anything touches disk, the
 * compile of every query against THIS package, the precondition, and the pair
 * of files it leaves. `withPackageLock` runs its callback, so the precondition
 * is checked where the service would check it.
 */
const EXAMPLE = path.resolve(
   import.meta.dir,
   "../../../../examples/storefront/public/apps/revenue-growth-by-year/app.json",
);
const manifest = () => JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));
const SLUG = "revenue-growth-by-year";

let root: string;

function harness(
   options: {
      frozen?: boolean;
      problems?: Array<{ severity: string; message: string }>;
      missingModel?: boolean;
   } = {},
) {
   const pkg = {
      getPackagePath: () => root,
      getModel: sinon.stub().returns(options.missingModel ? undefined : {}),
   };
   const environment = {
      getPackage: sinon.stub().resolves(pkg),
      compileSource: sinon
         .stub()
         .resolves({ problems: options.problems ?? [] }),
      withPackageLock: sinon
         .stub()
         .callsFake(async (_pkg: string, fn: () => Promise<unknown>) => fn()),
   };
   const store = {
      publisherConfigIsFrozen: options.frozen ?? false,
      getEnvironment: sinon.stub().resolves(environment),
   } as unknown as EnvironmentStore;
   return { controller: new DataAppController(store), environment };
}

const appDir = () => path.join(root, "public", "apps", SLUG);
const readApp = (file: string) =>
   fs.readFileSync(path.join(appDir(), file), "utf8");

describe("DataAppController", () => {
   beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "data-app-"));
   });
   afterEach(() => {
      sinon.restore();
      fs.rmSync(root, { recursive: true, force: true });
   });

   it("compiles every query against the package, then writes app.json and its page", async () => {
      const { controller, environment } = harness();
      const result = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      const written = readApp("app.json");
      expect(result).toEqual({
         resource: `/environments/env/packages/pkg/apps/${SLUG}/`,
         path: `apps/${SLUG}/app.json`,
         contentHash: contentHashOf(written),
         created: true,
      });
      expect(JSON.parse(written)).toEqual(manifest());
      expect(readApp("index.html")).toBe(indexHtmlFor(manifest()));
      const compile = environment.compileSource.firstCall.args;
      expect(compile.slice(0, 3)).toEqual([
         "pkg",
         "storefront.malloy",
         "run: order_items -> sales_by_year",
      ]);
      expect(compile[5]).toBe("append");
      expect(
         environment.compileSource.calledBefore(environment.withPackageLock),
      ).toBe(true);
      // Nothing staged is left beside it.
      expect(fs.readdirSync(path.join(root, "public", "apps"))).toEqual([SLUG]);
   });

   it("replaces an app by the hash it was read with, and regenerates the page", async () => {
      const { controller } = harness();
      const first = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      fs.writeFileSync(path.join(appDir(), "stray.txt"), "left behind");
      const next = { ...manifest(), title: "Revenue kept growing" };
      const second = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: next,
         expectedHash: first.contentHash,
      });
      expect(second.created).toBe(false);
      expect(readApp("index.html")).toContain(
         "<title>Revenue kept growing</title>",
      );
      expect(fs.readdirSync(appDir()).sort()).toEqual([
         "app.json",
         "index.html",
      ]);
      expect(fs.readdirSync(path.join(root, "public", "apps"))).toEqual([SLUG]);
   });

   it("refuses to create over an existing app, and to replace one that changed", async () => {
      const { controller } = harness();
      const first = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      await expect(
         controller.putDataApp("env", "pkg", SLUG, { manifest: manifest() }),
      ).rejects.toBeInstanceOf(WriteConflictError);
      await expect(
         controller.putDataApp("env", "pkg", SLUG, {
            manifest: manifest(),
            expectedHash: contentHashOf("something else"),
         }),
      ).rejects.toBeInstanceOf(WriteConflictError);
      expect(contentHashOf(readApp("app.json"))).toBe(first.contentHash);
   });

   it("refuses a query that does not compile in this package, writing nothing", async () => {
      const { controller } = harness({
         problems: [
            { severity: "error", message: "'order_items' is not defined" },
         ],
      });
      const refusal = controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      await expect(refusal).rejects.toBeInstanceOf(CompileRefusedError);
      await expect(refusal).rejects.toThrow(/q1:.*order_items/);
      expect(fs.existsSync(appDir())).toBe(false);
   });

   it("refuses a manifest whose model is not in this package as a compile refusal, not a 404", async () => {
      const { controller, environment } = harness({ missingModel: true });
      const refusal = controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      await expect(refusal).rejects.toBeInstanceOf(CompileRefusedError);
      await expect(refusal).rejects.toThrow(
         "storefront.malloy is not a model in package pkg",
      );
      expect(environment.compileSource.called).toBe(false);
      expect(fs.existsSync(appDir())).toBe(false);
   });

   it("refuses before compiling: frozen config, a bad slug, an invalid manifest", async () => {
      const frozen = harness({ frozen: true });
      await expect(
         frozen.controller.putDataApp("env", "pkg", SLUG, {
            manifest: manifest(),
         }),
      ).rejects.toBeInstanceOf(FrozenConfigError);

      const { controller, environment } = harness();
      for (const slug of ["_drafts", "Has-Caps", "../escape", ""]) {
         await expect(
            controller.putDataApp("env", "pkg", slug, { manifest: manifest() }),
         ).rejects.toBeInstanceOf(BadRequestError);
      }
      const invalid = { ...manifest(), snapshot: undefined };
      await expect(
         controller.putDataApp("env", "pkg", SLUG, { manifest: invalid }),
      ).rejects.toThrow(/not valid.*snapshot/);
      expect(environment.compileSource.called).toBe(false);
   });

   it("reads an app back with the hash a write needs, and says why one cannot be read", async () => {
      const { controller } = harness();
      await expect(
         controller.getDataApp("env", "pkg", SLUG),
      ).rejects.toBeInstanceOf(DataAppNotFoundError);
      const written = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      const read = await controller.getDataApp("env", "pkg", SLUG);
      expect(read.contentHash).toBe(written.contentHash);
      expect(read.manifest).toEqual(manifest());

      fs.writeFileSync(
         path.join(appDir(), "app.json"),
         JSON.stringify({ ...manifest(), version: 9 }),
      );
      const unreadable = await controller.getDataApp("env", "pkg", SLUG);
      expect(unreadable.manifest).toBeUndefined();
      expect(unreadable.problem).toContain("Version 9");
   });

   it("deletes an app by its hash, and not otherwise", async () => {
      const { controller } = harness();
      const written = await controller.putDataApp("env", "pkg", SLUG, {
         manifest: manifest(),
      });
      await expect(
         controller.deleteDataApp("env", "pkg", SLUG, undefined),
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
         controller.deleteDataApp("env", "pkg", SLUG, contentHashOf("stale")),
      ).rejects.toBeInstanceOf(WriteConflictError);
      expect(fs.existsSync(appDir())).toBe(true);
      await controller.deleteDataApp("env", "pkg", SLUG, written.contentHash);
      expect(fs.existsSync(appDir())).toBe(false);
      await expect(
         controller.deleteDataApp("env", "pkg", SLUG, written.contentHash),
      ).rejects.toBeInstanceOf(DataAppNotFoundError);
   });
});
