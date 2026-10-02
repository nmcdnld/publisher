// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { expect, test } from "@playwright/test";
import { DEFAULT_ENV, PACKAGES } from "./helpers/fixtures";

// A manifest-backed data app: `public/apps/<slug>/app.json` beside a generated
// index.html that loads /sdk/publisher-app.js. Waits are on what the renderer
// marks when it has drawn, never on `networkidle`: the page holds a live-reload
// event stream open, so the network never idles.

const SLUG = "revenue-growth-by-year";
const PAGE = `/environments/${DEFAULT_ENV}/packages/${PACKAGES.storefront}/apps/${SLUG}/`;

test.describe("package-manifest-apps", () => {
   test("the page draws its finding from the manifest and a live query", async ({
      page,
   }) => {
      await page.goto(PAGE);
      const app = page.locator('#publisher-app[data-state="ready"]');
      await expect(app).toBeVisible({ timeout: 30000 });
      await expect(app.locator('[data-chart="drawn"] svg').first()).toBeVisible();
      await expect(
         app.getByRole("heading", {
            name: "Revenue grew about a third each year",
         }),
      ).toBeVisible();
      await expect(app.getByText("Charts are live.")).toBeVisible();
   });

   test("the Console's viewer shows it with no Console change", async ({
      page,
   }) => {
      await page.goto(
         `/${DEFAULT_ENV}/${PACKAGES.storefront}/data-apps/apps/${SLUG}/index.html`,
      );
      const frame = page.frameLocator("iframe");
      await expect(
         frame.locator(
            '#publisher-app[data-state="ready"] [data-chart="drawn"]',
         ),
      ).toBeVisible({ timeout: 30000 });
   });

   test("a query that fails draws the saved rows and says so", async ({
      page,
   }) => {
      await page.route("**/api/v0/environments/**/query", (route) =>
         route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: "'sales_by_year' is not defined" }),
         }),
      );
      await page.goto(PAGE);
      const app = page.locator('#publisher-app[data-state="ready"]');
      await expect(app).toBeVisible({ timeout: 30000 });
      await expect(app.locator('[data-chart="drawn"] svg').first()).toBeVisible();
      await expect(app.getByText(/Showing the rows as of/)).toContainText(
         "'sales_by_year' is not defined",
      );
   });
});
