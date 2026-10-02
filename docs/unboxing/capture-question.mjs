// Walks the explorer's Question mode on storefront, one screenshot per answer.
// Needs the dev Console on :5173 (bun run start:dev:react) over Publisher on :4000.
//   node docs/unboxing/capture-question.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "img");
mkdirSync(out, { recursive: true });
const MODEL = "http://localhost:5173/examples/storefront/storefront.malloy";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
   viewport: { width: 1440, height: 1000 },
   deviceScaleFactor: 2,
});
const page = await context.newPage();

const shot = async (name) => {
   await page.waitForTimeout(2500);
   await page.screenshot({ path: join(out, `${name}.png`) });
   console.log(`ok ${name}`);
};
const answer = async (placeholder, text, nth = 0) => {
   const input = page.getByPlaceholder(placeholder).nth(nth);
   await input.click();
   await input.fill(text);
   await page.waitForTimeout(400);
   await page.keyboard.press("ArrowDown");
   await page.keyboard.press("Enter");
};

await page.addInitScript(() =>
   window.localStorage.setItem("publisher.explorer.mode", "fields"),
);
await page.goto(MODEL, { waitUntil: "networkidle" });
const sourcePicker = page.locator("#size-small-standard");
await sourcePicker.click();
await sourcePicker.fill("order_items");
await page.getByRole("option", { name: "order_items", exact: true }).click();
await shot("question-0-fields");

await page.getByRole("button", { name: "Question", exact: true }).click();
await shot("question-1-empty");

const measureInput = page.getByPlaceholder("Choose a measure");
await measureInput.click();
await page.getByRole("listbox").waitFor();
await shot("question-1b-dropdown");
await page.keyboard.press("Escape");

await answer("Choose a measure", "Revenue");
await shot("question-2-measure");

await answer("Choose a dimension", "Category");
await shot("question-3-group");

await answer("Choose a dimension", "Region", 1);
await shot("question-4-segment");

// Back to a time series: a temporal group-by brings its grain picker.
await answer("Choose a dimension", "Created at");
await shot("question-5-temporal");

await page.getByRole("button", { name: "Fields", exact: true }).click();
await shot("question-6-back-to-fields");

// The same three answers picked by hand in Fields mode: the result is a table.
await page.goto(MODEL, { waitUntil: "networkidle" });
await sourcePicker.click();
await sourcePicker.fill("order_items");
await page.getByRole("option", { name: "order_items", exact: true }).click();
await page.waitForTimeout(1500);
const fieldSearch = page.getByPlaceholder("Search", { exact: true });
for (const field of ["total_sales", "category", "region"]) {
   await fieldSearch.fill(field);
   await page.waitForTimeout(700);
   await page
      .locator("div[data-state]")
      .filter({ has: page.getByText(field, { exact: true }) })
      .locator("button")
      .first()
      .click();
   await page.waitForTimeout(800);
}
await fieldSearch.fill("");
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.waitForTimeout(3000);
await page.getByText("Results", { exact: true }).click();
await shot("question-0b-fields-table");

await browser.close();
