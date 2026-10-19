// Screenshots for data-dictionary.html: the Data Dictionary and Question
// Coverage pages in the Console, over the bundled `storefront` package.
// Drafts and coverage runs live in localStorage, so every flow shares one
// persistent profile (DD_PROFILE) and a later flow sees what an earlier one made.
// Needs Publisher on :4000, the Console on :5180 and console-ai on :8790.
//   node docs/unboxing/capture-data-dictionary.mjs [flow ...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "img", "data-dictionary");
mkdirSync(out, { recursive: true });
const APP = process.env.CONSOLE_URL ?? "http://127.0.0.1:5180";
const BASE = `${APP}/examples/storefront`;
const PROFILE =
   process.env.DD_PROFILE ?? join(here, "..", "..", ".tmp-anno", "dd-profile");

const context = await chromium.launchPersistentContext(PROFILE, {
   channel: "chrome",
   viewport: { width: 1440, height: 900 },
   deviceScaleFactor: 2,
   permissions: ["clipboard-read", "clipboard-write"],
});
const page = context.pages()[0] ?? (await context.newPage());

const VIEWPORT = { width: 1440, height: 900 };
/** The Console scrolls an inner element, so a full page means a tall viewport. */
const contentHeight = () =>
   page.evaluate(() =>
      Math.max(
         document.documentElement.scrollHeight,
         ...[...document.querySelectorAll("main, main *")]
            .filter((el) => el.scrollHeight > el.clientHeight + 40)
            .map((el) => el.scrollHeight + el.getBoundingClientRect().top),
      ),
   );
const shot = async (name, opts = {}) => {
   await page.waitForTimeout(opts.wait ?? 1200);
   if (opts.fullPage) {
      const height = Math.min(await contentHeight(), opts.maxHeight ?? 4200);
      await page.setViewportSize({ width: VIEWPORT.width, height });
      await page.waitForTimeout(2500);
   }
   await page.screenshot({ path: join(out, `${name}.png`), clip: opts.clip });
   if (opts.fullPage) await page.setViewportSize(VIEWPORT);
   console.log(`ok ${name}`);
};
const open = async (path, wait = 3500) => {
   await page.goto(BASE + path, { waitUntil: "load" });
   await page.waitForTimeout(wait);
};
const scrollMain = (y) =>
   page.evaluate((top) => window.scrollTo({ top }), y);
const until = async (predicate, timeout = 600000, every = 3000) => {
   const deadline = Date.now() + timeout;
   while (Date.now() < deadline) {
      if (await predicate()) return true;
      await page.waitForTimeout(every);
   }
   return false;
};

/** The finished run: score, the whole page, the top gap, and one question's verdict. */
async function coverageResults(prefix) {
   await shot(`${prefix}-score`, { wait: 2000 });
   await shot(`${prefix}-full`, { fullPage: true });
   const backlog = page.locator("[data-slot=card]").filter({ hasText: "Gap backlog" });
   const top = backlog.locator("details summary").first();
   if (await top.count()) {
      await top.click();
      await backlog.scrollIntoViewIfNeeded();
      await shot(`${prefix}-gaps`);
   }
   const list = page.locator("[data-slot=card]").filter({ hasText: /^Questions/ });
   await list.getByRole("tab", { name: "Missing" }).click();
   const first = list.locator("button.w-full").first();
   if (await first.count()) {
      await first.click();
      await shot(`${prefix}-question`, { wait: 1500 });
      await page.keyboard.press("Escape");
   }
}

const flows = {
   async tour() {
      await open("/dictionary", 5000);
      await shot("index");
      await shot("index-full", { fullPage: true });
      await open("/dictionary/storefront.malloy:order_items", 6000);
      await shot("source");
      await shot("source-full", { fullPage: true });
      await open("/dictionary/storefront.malloy:order_items.total_sales", 6000);
      await shot("field");
      await open(
         "/dictionary/storefront.malloy:order_items.margin_by_category",
         6000,
      );
      await shot("view");
      await shot("view-full", { fullPage: true });
   },

   async drafts() {
      await open("/dictionary", 5000);
      const draft = page.getByRole("button", { name: /^Draft \d+ missing/ });
      if (await draft.count()) {
         await draft.first().click();
         await shot("drafts-running", { wait: 9000 });
         await until(
            async () =>
               !(await page.getByText(/^Drafting \d+ of \d+/).count()),
            600000,
         );
      } else {
         await page
            .getByRole("button", { name: /Review \d+ draft/ })
            .first()
            .click();
      }
      await shot("drafts-review", { wait: 2000 });
   },

   async review() {
      const id = "storefront.malloy:products.retail_price";
      await open(`/dictionary/${id}`, 5000);
      await shot("draft-entity");
      const card = page
         .locator("main div.rounded-lg.border-dashed")
         .filter({ hasText: /retail price/i })
         .first();
      await card.getByRole("button", { name: "Edit" }).click();
      const box = page.locator("main textarea").first();
      await box.fill(
         "List price of the product in USD, before any discount; what an order line actually charged is order_items.sale_price.",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await shot("draft-edited");

      await open(`/dictionary?panel=drafts`, 4000);
      const all = page.getByRole("button", { name: /^Accept all \d+/ });
      if (await all.count()) await all.click();
      await shot("drafts-accepted");
      await page.getByRole("button", { name: /Review and promote/ }).click();
      await until(async () => !(await page.getByText("Compiling…").count()), 60000, 1000);
      await shot("promote", { wait: 1500 });
      await shot("promote-full", { fullPage: true, maxHeight: 3000 });
      await page.getByRole("button", { name: /Copy patch/ }).click();
      const patch = await page.evaluate(() => navigator.clipboard.readText());
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(PROFILE, "..", "dd-docs.patch"), patch);
      console.log(`patch: ${patch.split("\n").length} lines`);
   },

   async askOpen() {
      await open("/dictionary/storefront.malloy:order_items.margin_rate", 6000);
      await page.getByRole("button", { name: /Ask about this/ }).first().click();
      await shot("ask-open", { wait: 2000 });
      await page.keyboard.press("Escape");
   },

   async ask() {
      await open("/dictionary/storefront.malloy:order_items", 5000);
      await page.getByRole("button", { name: /Ask about this/ }).first().click();
      await shot("ask-open", { wait: 1500 });
      const box = page.locator("textarea").last();
      await box.fill("Which product category has the worst return rate, and how far off the average is it?");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(5000);
      await until(
         async () => !(await page.getByRole("button", { name: "Stop" }).count()),
         5 * 60000,
         2000,
      );
      await shot("ask-answer", { wait: 2500 });
      await open("/coverage", 5000);
      const heat = page.locator("[data-slot=card]").filter({ hasText: "Heat map" });
      await heat.scrollIntoViewIfNeeded();
      await shot("coverage-asked", { wait: 1500 });
   },

   async cards() {
      await page.setViewportSize({ width: 1440, height: 4600 });
      await open("/dictionary/storefront.malloy:order_items", 9000);
      for (const [title, name] of [
         ["Live data", "card-live-data"],
         ["Fields", "card-fields"],
         ["Content graph", "card-content-graph"],
      ]) {
         const card = page
            .locator("main [data-slot=card]")
            .filter({ has: page.getByText(title, { exact: true }) })
            .first();
         await card.screenshot({ path: join(out, `${name}.png`) });
         console.log(`ok ${name}`);
      }
      await open("/coverage", 4000);
      await page
         .getByRole("button", { name: /gross margin percentage by product category/ })
         .last()
         .click();
      await page.waitForTimeout(2000);
      await page
         .locator("[data-slot=sheet-content]")
         .screenshot({ path: join(out, "question-sheet.png") });
      console.log("ok question-sheet");
      await page.setViewportSize(VIEWPORT);
   },

   async after() {
      await open("/dictionary", 6000);
      await shot("after-index");
      await open("/dictionary/storefront.malloy:products.cost", 5000);
      await shot("after-cost");
   },

   async promotePanel() {
      await page.setViewportSize({ width: 1440, height: 1400 });
      await open("/dictionary?panel=promote", 4000);
      await until(async () => !(await page.getByText("Compiling…").count()), 60000, 1000);
      await shot("promote-panel", {
         wait: 1500,
         clip: { x: 975, y: 0, width: 465, height: 1400 },
      });
      await page.setViewportSize(VIEWPORT);
   },

   async content() {
      await open(
         "/dictionary?content=dashboard%3Adashboards%2Foverview.malloy",
         9000,
      );
      await shot("content-dashboard", { wait: 2000 });
      await open("/dictionary/storefront.malloy:customers.state", 6000);
      await shot("column");
      await open("/dictionary/storefront.malloy:order_items", 6000);
      await shot("source-full", { fullPage: true, maxHeight: 4600 });
      await open("/dictionary", 6000);
      await shot("index-full", { fullPage: true, maxHeight: 2600 });
   },

   async coverage() {
      await open("/coverage", 4000);
      await shot("coverage-empty");
      await page.getByRole("button", { name: /Write 25 questions/ }).click();
      await shot("coverage-writing", { wait: 25000 });
      await shot("coverage-judging", { wait: 45000 });
      const busy = () =>
         page
            .getByText(/Writing questions|Answering with the chat agent|Classifying/)
            .count();
      await until(async () => !(await busy()), 30 * 60000, 5000);
      await coverageResults("coverage");
   },

   async results() {
      await open("/coverage", 4000);
      await coverageResults("coverage");
   },

   async detail() {
      await open("/coverage", 4000);
      await page
         .getByRole("button", { name: /gross margin percentage by product category/ })
         .last()
         .click();
      await shot("question-detail", { wait: 1500 });
      await page.setViewportSize({ width: 1440, height: 2600 });
      await shot("question-detail-full", { wait: 2000 });
      await page.setViewportSize(VIEWPORT);
      await page.getByRole("button", { name: /Download/ }).click();
      await shot("question-handoff", { wait: 800 });
      await page.keyboard.press("Escape");
   },

   async rescore() {
      await open("/coverage", 4000);
      await page.getByRole("button", { name: /Re-score these/ }).click();
      await shot("rescore-running", { wait: 30000 });
      const busy = () =>
         page.getByText(/Answering with the chat agent|Classifying/).count();
      await until(async () => !(await busy()), 30 * 60000, 5000);
      await coverageResults("rescore");
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
await context.close();
