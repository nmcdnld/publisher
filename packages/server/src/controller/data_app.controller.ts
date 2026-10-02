// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
   APPS_DIR,
   appPaths,
   indexHtmlFor,
   INDEX_FILE,
   isSlug,
   MANIFEST_FILE,
   readManifest,
   type AppManifest,
} from "@malloy-publisher/app-manifest";
import { components } from "../api";
import {
   BadRequestError,
   CompileRefusedError,
   DataAppNotFoundError,
   FrozenConfigError,
   ModelNotFoundError,
   WriteConflictError,
} from "../errors";
import { logger } from "../logger";
import { assertSafeRelativeModelPath, safeJoinUnderRoot } from "../path_safety";
import { formatProblem } from "../service/query_text";
import { EnvironmentStore } from "../service/environment_store";
import type { Environment } from "../service/environment";
import type { Package } from "../service/package";
import { contentHashOf } from "./dashboard.controller";

type ApiDataAppWrite = components["schemas"]["DataAppWriteRequest"];
type ApiDataAppWriteResult = components["schemas"]["DataAppWriteResult"];
type ApiDataAppManifestRead = components["schemas"]["DataAppManifestRead"];

/** The text written as `app.json`; its hash is what a caller sends back. */
const manifestText = (manifest: AppManifest) =>
   `${JSON.stringify(manifest, null, 2)}\n`;

async function readIfPresent(file: string): Promise<string | undefined> {
   try {
      return await fs.promises.readFile(file, "utf8");
   } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return undefined;
   }
}

/**
 * Manifest-backed data apps: `public/apps/<slug>/app.json` and the generated
 * `index.html` beside it. The manifest's model paths are package-relative, and
 * every query is compiled against the package being written before anything
 * is, so a finding can only be saved into a package whose models it runs on.
 */
export class DataAppController {
   constructor(private environmentStore: EnvironmentStore) {}

   public async getDataApp(
      environmentName: string,
      packageName: string,
      slug: string,
   ): Promise<ApiDataAppManifestRead> {
      assertSlug(slug);
      const { dir } = await this.locate(environmentName, packageName, slug);
      const text = await readIfPresent(path.join(dir, MANIFEST_FILE));
      if (text === undefined) throw notFound(packageName, slug);
      const base = {
         resource: resourceOf(environmentName, packageName, slug),
         path: appPaths(slug).manifest,
         contentHash: contentHashOf(text),
      };
      let parsed: unknown;
      try {
         parsed = JSON.parse(text);
      } catch {
         return { ...base, problem: `${MANIFEST_FILE} is not JSON` };
      }
      const read = readManifest(parsed);
      return read.ok
         ? { ...base, manifest: read.manifest }
         : { ...base, problem: read.problem };
   }

   /**
    * Write the app's two files, as a pair.
    *
    * In order: refuse under `frozenConfig`; check the slug and the manifest;
    * compile every query against this package, refusing with the problems when
    * any does not compile; then, under one hold of the package lock, check the
    * caller's precondition and swap the new directory in. `expectedHash`
    * absent means "create", so an existing app is a conflict, never an
    * unconditional overwrite. No package reload: `public/` is not compiled.
    */
   public async putDataApp(
      environmentName: string,
      packageName: string,
      slug: string,
      body: ApiDataAppWrite,
   ): Promise<ApiDataAppWriteResult> {
      this.assertWritable("write");
      assertSlug(slug);
      if (body?.manifest === undefined || body.manifest === null) {
         throw new BadRequestError(
            "The request body needs a `manifest`: the app's app.json.",
         );
      }
      const read = readManifest(body.manifest);
      if (!read.ok) {
         throw new BadRequestError(
            `The manifest is not valid, so nothing was written: ${read.problem}`,
         );
      }
      const manifest = read.manifest;
      const { environment, pkg, dir } = await this.locate(
         environmentName,
         packageName,
         slug,
      );
      await compileQueries(environment, pkg, packageName, manifest);

      const text = manifestText(manifest);
      const { created } = await environment.withPackageLock(
         packageName,
         async () => {
            const current = await readIfPresent(path.join(dir, MANIFEST_FILE));
            checkPrecondition(slug, current, body.expectedHash);
            await swapIn(dir, {
               [MANIFEST_FILE]: text,
               [INDEX_FILE]: indexHtmlFor(manifest),
            });
            return { created: current === undefined };
         },
      );
      return {
         resource: resourceOf(environmentName, packageName, slug),
         path: appPaths(slug).manifest,
         contentHash: contentHashOf(text),
         created,
      };
   }

   public async deleteDataApp(
      environmentName: string,
      packageName: string,
      slug: string,
      expectedHash: string | undefined,
   ): Promise<void> {
      this.assertWritable("delete");
      assertSlug(slug);
      if (!expectedHash) {
         throw new BadRequestError(
            "Send the `expectedHash` of the app.json you read to delete the app.",
         );
      }
      const { environment, dir } = await this.locate(
         environmentName,
         packageName,
         slug,
      );
      await environment.withPackageLock(packageName, async () => {
         const current = await readIfPresent(path.join(dir, MANIFEST_FILE));
         if (current === undefined) throw notFound(packageName, slug);
         checkPrecondition(slug, current, expectedHash);
         await fs.promises.rm(dir, { recursive: true, force: true });
      });
   }

   private assertWritable(verb: string) {
      if (this.environmentStore.publisherConfigIsFrozen) {
         throw new FrozenConfigError(
            `Cannot ${verb} a data app: publisher.config.json has "frozenConfig": true.`,
         );
      }
   }

   /** The app's directory; loading the package is the 404 for one that does not exist. */
   private async locate(
      environmentName: string,
      packageName: string,
      slug: string,
   ): Promise<{ environment: Environment; pkg: Package; dir: string }> {
      const environment = await this.environmentStore.getEnvironment(
         environmentName,
         false,
      );
      const pkg = await environment.getPackage(packageName, false);
      const dir = safeJoinUnderRoot(
         pkg.getPackagePath(),
         "public",
         APPS_DIR,
         slug,
      );
      return { environment, pkg, dir };
   }
}

function assertSlug(slug: string) {
   if (!isSlug(slug)) {
      throw new BadRequestError(
         `\`${slug}\` is not an app slug: lowercase letters, digits and dashes, ` +
            `starting with a letter or digit, at most 64 characters.`,
      );
   }
}

const resourceOf = (env: string, pkg: string, slug: string) =>
   `/environments/${env}/packages/${pkg}/${appPaths(slug).dir}/`;

const notFound = (pkg: string, slug: string) =>
   new DataAppNotFoundError(
      `Package ${pkg} has no data app at public/${appPaths(slug).dir}/`,
   );

function checkPrecondition(
   slug: string,
   current: string | undefined,
   expectedHash: string | undefined,
) {
   const where = `public/${appPaths(slug).dir}/`;
   if (expectedHash === undefined) {
      if (current !== undefined)
         throw new WriteConflictError(
            `${where} already exists in the package. Send the \`expectedHash\` ` +
               `of the app.json you read to replace it.`,
         );
      return;
   }
   if (current === undefined)
      throw new WriteConflictError(
         `${where} no longer exists in the package, so the app you read cannot ` +
            `be updated. Save it as a new app instead.`,
      );
   if (contentHashOf(current) !== expectedHash)
      throw new WriteConflictError(
         `${where} changed in the package since you read it. Re-open it and ` +
            `reapply your change; nothing was written.`,
      );
}

/**
 * Compile every query at append scope against the package it is being saved
 * into. A model the package does not have is a refusal like any other, not a
 * 404: the package exists, the manifest is what does not belong in it.
 */
async function compileQueries(
   environment: Environment,
   pkg: Package,
   packageName: string,
   manifest: AppManifest,
) {
   const refusals: string[] = [];
   for (const [id, query] of Object.entries(manifest.queries)) {
      assertSafeRelativeModelPath(query.model);
      const missing = `${id}: ${query.model} is not a model in package ${packageName}`;
      if (!pkg.getModel(query.model)) {
         refusals.push(missing);
         continue;
      }
      try {
         const { problems } = await environment.compileSource(
            packageName,
            query.model,
            query.malloy,
            false,
            query.givens as Parameters<Environment["compileSource"]>[4],
            "append",
         );
         const errors = problems.filter((p) => p.severity === "error");
         if (errors.length > 0) {
            refusals.push(`${id}: ${errors.map(formatProblem).join("; ")}`);
         }
      } catch (error) {
         if (!(error instanceof ModelNotFoundError)) throw error;
         refusals.push(missing);
      }
   }
   if (refusals.length > 0) {
      throw new CompileRefusedError(
         `The manifest's queries do not compile in package ${packageName}, so ` +
            `nothing was written: ${refusals.join(" | ")}`,
      );
   }
}

/**
 * Replace `dir` with a directory holding exactly `files`. The new directory is
 * built beside it and renamed into place; an existing one is renamed aside
 * first and removed after, so a reader sees the old pair or the new pair and
 * never one file from each. The caller holds the package lock.
 */
async function swapIn(dir: string, files: Record<string, string>) {
   const parent = path.dirname(dir);
   const id = crypto.randomUUID();
   const staged = path.join(parent, `.${path.basename(dir)}.${id}.tmp`);
   const retired = path.join(parent, `.${path.basename(dir)}.${id}.old`);
   await fs.promises.mkdir(staged, { recursive: true });
   try {
      for (const [name, text] of Object.entries(files)) {
         await fs.promises.writeFile(path.join(staged, name), text, "utf8");
      }
      const existed = await fs.promises
         .rename(dir, retired)
         .then(() => true)
         .catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return false;
            throw error;
         });
      try {
         await fs.promises.rename(staged, dir);
      } catch (error) {
         if (existed) await fs.promises.rename(retired, dir);
         throw error;
      }
      if (existed) {
         await fs.promises
            .rm(retired, { recursive: true, force: true })
            .catch((error) =>
               logger.warn("Could not remove a replaced data app directory", {
                  retired,
                  error,
               }),
            );
      }
   } finally {
      await fs.promises.rm(staged, { recursive: true, force: true });
   }
}
