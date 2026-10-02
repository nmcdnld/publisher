// Credible Demo's interactive flows, for credible-demo.html: Library by
// package, a native data app page, a chat thread and its saves, the composer's
// mentions, the user menu's theme and workspace panels, and a white-labeled
// workspace. Each flow runs in a fresh browser context, so nothing here touches
// your own browser's localStorage.
// Needs Publisher on :4000 and Credible Demo on :5180.
//   node docs/unboxing/capture-credible-demo-flows.mjs [flow ...]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "img", "credible-demo");
mkdirSync(out, { recursive: true });
const APP = process.env.CREDIBLE_DEMO_URL ?? "http://localhost:5180";

const browser = await chromium.launch({ channel: "chrome" });
const fresh = async (init) => {
   const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
   });
   if (init) await context.addInitScript(init.fn, init.arg);
   return { context, page: await context.newPage() };
};
const shot = async (page, name, wait = 1500) => {
   await page.waitForTimeout(wait);
   await page.screenshot({ path: join(out, `${name}.png`) });
   console.log(`ok ${name}`);
};
// The user menu opens from the bottom-left corner; this frames it with a bit of page.
const MENU_CLIP = { x: 0, y: 240, width: 620, height: 660 };
const crop = async (page, name, clip = MENU_CLIP) => {
   await page.screenshot({ path: join(out, `${name}.png`), clip });
   console.log(`ok ${name}`);
};
const open = async (page, path, wait = 4000) => {
   await page.goto(APP + path, { waitUntil: "load" });
   await page.waitForTimeout(wait);
};
// Previews and data apps are iframes, so the parent page looks done while they
// still show a spinner, a skeleton, or "Loading…" text.
const BUSY = /\b(Running|Loading|Fetching)\b/;
const BUSY_SELECTOR =
   ".MuiSkeleton-root, .MuiCircularProgress-root, [data-slot=skeleton], .animate-pulse";
const busyFrames = async (page) => {
   const busy = [];
   for (const frame of page.frames()) {
      const state = await frame
         .evaluate(
            ([selector, pattern]) =>
               !!document.querySelector(selector) ||
               new RegExp(pattern).test(document.body?.innerText ?? ""),
            [BUSY_SELECTOR, BUSY.source],
         )
         .catch(() => false);
      if (state) busy.push(frame.url() || "(page)");
   }
   return busy;
};
/** Waits until every frame has been free of loading markers for two polls in a row. */
const settle = async (page, name, timeout = 120000) => {
   const deadline = Date.now() + timeout;
   let clean = 0;
   while (clean < 2 && Date.now() < deadline) {
      await page.waitForTimeout(1000);
      clean = (await busyFrames(page)).length ? 0 : clean + 1;
   }
   const busy = await busyFrames(page);
   if (busy.length) console.warn(`${name}: still loading in ${busy.join(", ")}`);
};

const flows = {
   async library() {
      const { context, page } = await fresh();
      await open(page, "/library?package=questionable-football", 5000);
      await settle(page, "library-package");
      await shot(page, "library-package", 3000);
      const links = await page.$$eval("a[href^='/packages/']", (as) => [
         ...new Set(as.map((a) => a.getAttribute("href"))),
      ]);
      console.log(links.join("\n"));
      const app = links.find((h) => h.includes("tight-end"));
      if (app) {
         await open(page, app, 12000);
         await shot(page, "package-data-app");
      }
      const cheatsheet = links.find(
         (h) => h.includes("/apps/") && h.endsWith("index.html") && !h.includes("/apps/apps"),
      );
      if (cheatsheet) {
         await open(page, cheatsheet, 5000);
         await settle(page, "package-html-app");
         await shot(page, "package-html-app", 2000);
      }
      await context.close();
   },

   async chat() {
      const { context, page } = await fresh();
      await open(page, "/chat/th-west", 5000);
      await shot(page, "chat-thread");
      await page.evaluate(() => {
         const main = document.querySelector("main") ?? document.body;
         const scroller = [...main.querySelectorAll("*")].find(
            (el) => el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== "visible",
         );
         (scroller ?? document.scrollingElement).scrollTop = 1e6;
      });
      await shot(page, "chat-thread-end");
      const more = page.getByRole("button", { name: /more ways to save/i }).last();
      if (await more.count()) {
         await more.click();
         await shot(page, "chat-save-menu", 800);
         const toPackage = page.getByRole("menuitem", { name: /save (again )?to|update in/i }).first();
         if (await toPackage.count()) {
            await toPackage.click();
            await shot(page, "chat-save-to-package", 4000);
         }
      }
      await context.close();
   },

   async analysis() {
      // The West chat answer as it was kept, so §05 shows one insight throughout.
      const { context, page } = await fresh();
      await open(page, "/analysis/an-west", 5000);
      await shot(page, "analysis");
      await page.mouse.move(700, 500);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
      await shot(page, "analysis-end");
      await context.close();
   },

   async forYou() {
      const { context, page } = await fresh();
      await open(page, "/analysis/an-revenue-west", 5000);
      await page.mouse.move(1300, 500);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
      await shot(page, "analysis-for-you");
      await open(page, "/", 5000);
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, 650);
      await shot(page, "discover-trending");
      await context.close();
   },

   async promoted() {
      // The West answer after "Save to storefront…", opened from the Console on :5173.
      const CONSOLE = process.env.CONSOLE_URL ?? "http://localhost:5173";
      const { context, page } = await fresh();
      await page.goto(
         `${CONSOLE}/examples/storefront/data-apps/apps/why-is-west-outperforming/index.html`,
         { waitUntil: "networkidle" },
      );
      await shot(page, "console-saved-insight", 6000);
      await context.close();
   },

   async composer() {
      const { context, page } = await fresh();
      await open(page, "/");
      const box = page.getByPlaceholder(/what would you like to do next/i).first();
      await box.click();
      await box.pressSequentially("Compare @", { delay: 60 });
      await shot(page, "composer-mention", 1200);
      await box.pressSequentially("draft", { delay: 60 });
      await shot(page, "composer-mention-filtered", 1200);
      await page.keyboard.press("Enter");
      await box.pressSequentially(" with @season", { delay: 60 });
      await page.waitForTimeout(800);
      await page.keyboard.press("Enter");
      await shot(page, "composer-mentions-placed", 1200);
      await page.getByRole("button", { name: /credible one/i }).first().click();
      await shot(page, "composer-model-picker", 1000);
      await context.close();
   },

   async menus() {
      const { context, page } = await fresh();
      await open(page, "/");
      await page.getByRole("button", { name: /noah mac/i }).click();
      await shot(page, "user-menu", 800);
      await crop(page, "user-menu-crop");
      await page.getByRole("button", { name: /workspace theme/i }).click();
      await shot(page, "theme-picker", 800);
      await crop(page, "theme-picker-crop");
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: /name, logo, and packages/i }).click();
      await shot(page, "workspace-settings", 800);
      await context.close();
   },

   async themes() {
      for (const [theme, mode] of [
         ["sky", "light"],
         ["lavender", "dark"],
         ["oxide", "dark"],
      ]) {
         const { context, page } = await fresh({
            fn: ([t, m]) => {
               localStorage.setItem("destination.workspace-theme", t);
               localStorage.setItem("destination.theme", m);
            },
            arg: [theme, mode],
         });
         await open(page, "/");
         await shot(page, `theme-${theme}-${mode}`);
         await context.close();
      }
   },

   async studio() {
      const { context, page } = await fresh();
      await open(page, "/studio", 5000);
      await page.getByRole("button", { name: /next run/i }).click();
      await shot(page, "studio-schedule", 1000);
      await page.keyboard.press("Escape");
      await page
         .getByRole("button", { name: /generate insight/i })
         .locator("xpath=following-sibling::button[1]")
         .click();
      await shot(page, "studio-recipe", 1000);
      await page.keyboard.press("Escape");
      await open(page, "/studio?view=all", 4000);
      await shot(page, "studio-all");
      await context.close();
   },

   async publish() {
      // Starts in the dev Console on :5173, whose Publish button opens :5180.
      const CONSOLE = process.env.CONSOLE_URL ?? "http://localhost:5173";
      const { context, page } = await fresh({
         fn: () => localStorage.setItem("publisher.explorer.mode", "question"),
      });
      await page.goto(`${CONSOLE}/examples/storefront/storefront.malloy`, {
         waitUntil: "networkidle",
      });
      const source = page.locator("#size-small-standard");
      await source.click();
      await source.fill("order_items");
      await page.getByRole("option", { name: "order_items", exact: true }).click();
      for (const [placeholder, text] of [
         ["Choose a measure", "Revenue"],
         ["Choose a dimension", "Category"],
      ]) {
         const input = page.getByPlaceholder(placeholder).first();
         await input.click();
         await input.fill(text);
         await page.waitForTimeout(400);
         await page.keyboard.press("ArrowDown");
         await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(3000);
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await shot(page, "publish-console-dialog", 1200);
      const [demo] = await Promise.all([
         context.waitForEvent("page"),
         page.getByRole("button", { name: /continue in destination/i }).click(),
      ]);
      await demo.setViewportSize({ width: 1440, height: 900 });
      await demo.waitForLoadState("load");
      await shot(demo, "publish-review", 6000);
      await demo.mouse.move(700, 500);
      await demo.mouse.wheel(0, 700);
      await shot(demo, "publish-review-end", 1500);
      await context.close();
   },

   async whitelabel() {
      const logo = `data:image/svg+xml;base64,${readFileSync(join(out, "qf-logo.svg")).toString("base64")}`;
      const { context, page } = await fresh({
         fn: (logoUrl) => {
            localStorage.setItem(
               "destination.workspaces",
               JSON.stringify([
                  {
                     id: "default",
                     name: "Questionable Football",
                     logo: logoUrl,
                     packages: ["questionable-football"],
                  },
               ]),
            );
            localStorage.setItem("destination.workspace-theme", "sage");
            localStorage.setItem("destination.theme", "dark");
         },
         arg: logo,
      });
      await open(page, "/library?scope=workspace", 5000);
      await settle(page, "whitelabel-library");
      await shot(page, "whitelabel-library", 3000);
      await page.getByRole("button", { name: /noah mac/i }).click();
      await page.getByRole("button", { name: /name, logo, and packages/i }).click();
      await shot(page, "whitelabel-settings", 800);
      await crop(page, "whitelabel-settings-crop", { x: 0, y: 0, width: 760, height: 900 });
      await context.close();
   },
};

const only = process.argv.slice(2);
for (const [name, flow] of Object.entries(flows)) {
   if (only.length && !only.includes(name)) continue;
   try {
      await flow();
   } catch (error) {
      console.warn(`${name}: ${error.message.split("\n")[0]}`);
   }
}
await browser.close();
