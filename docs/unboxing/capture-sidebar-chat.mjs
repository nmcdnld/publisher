// Screenshots for sidebar-chat.html: the rail, the Chats page, and the side
// chat on a dashboard and a notebook in packages/credible-clone, over the
// bundled `storefront` package. Chats live in memory, so the whole tour runs in
// one page load and moves by clicking, never by reloading.
// Needs Publisher on :4000 and the clone on :5180 with an OPENROUTER_API_KEY.
//   node docs/unboxing/capture-sidebar-chat.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "img", "sidebar-chat");
mkdirSync(out, { recursive: true });
const APP = process.env.CLONE_URL ?? "http://127.0.0.1:5180";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
   viewport: { width: 1440, height: 900 },
   deviceScaleFactor: 2,
});
const page = await context.newPage();

const shot = async (name, opts = {}) => {
   await page.waitForTimeout(opts.wait ?? 1200);
   await page.screenshot({ path: join(out, `${name}.png`), clip: opts.clip });
   console.log(`ok ${name}`);
};
const until = async (predicate, timeout = 5 * 60000, every = 2000) => {
   const deadline = Date.now() + timeout;
   while (Date.now() < deadline) {
      if (await predicate()) return true;
      await page.waitForTimeout(every);
   }
   return false;
};
const replying = () =>
   page.getByRole("button", { name: "Stop", exact: true }).count();
const awaitReply = async () => {
   await page.waitForTimeout(4000);
   await until(async () => !(await replying()));
};
const rail = page.locator("aside").first();
const railLink = (name) => rail.getByRole("link", { name, exact: true });
/** Moves within the app without a reload, so the in-memory chats survive. */
const go = async (path, wait = 1500) => {
   await page.evaluate((to) => {
      history.pushState({}, "", to);
      dispatchEvent(new PopStateEvent("popstate"));
   }, path);
   await page.waitForTimeout(wait);
};
const ask = async (text) => {
   const box = page.locator("textarea").last();
   await box.click();
   await box.fill(text);
   await page.keyboard.press("Enter");
};

// 1 · Home and the rail
await page.goto(APP, { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.mouse.move(900, 450);
await shot("home");
await rail.hover();
await shot("rail-hover", { wait: 900 });
await page.keyboard.press("Meta+b");
await page.mouse.move(900, 450);
await shot("rail-pinned", { wait: 900 });
await page.keyboard.press("Meta+b");
await page.mouse.move(900, 450);

// 2 · Chats: new chat, a thread, the filter menu
await railLink("Chats").click();
await page.mouse.move(900, 450);
await shot("new-chat");
await page.getByRole("link", { name: /Revenue performance dashboard/ }).click();
await shot("thread");
const search = page.getByPlaceholder("Search or filter chats");
await search.click();
await shot("filter-menu", { wait: 600 });
await page.getByRole("option", { name: /Package/ }).click();
await shot("filter-package", { wait: 600 });
await page.getByRole("option", { name: /thelook_ecommerce/ }).click();
await shot("filter-chip", { wait: 600 });
await page.getByRole("button", { name: /Remove Package filter/ }).click();

// 3 · A dashboard, its composer, and the side chat
await go("/reports/storefront/dashboard/overview");
await page.mouse.move(900, 300);
await shot("dashboard", { wait: 9000 });
await ask(
   "Which product category has the highest gross margin, and how far above the average is it?",
);
await shot("side-streaming", { wait: 7000 });
await awaitReply();
await shot("side-answer", { wait: 2500 });
await ask("And which region brings in the most revenue?");
await shot("side-followup-streaming", { wait: 7000 });
await awaitReply();
await shot("side-followup", { wait: 2500 });
const thread = page.locator("aside.sticky div.overflow-y-auto").first();
await thread.evaluate((el) => el.scrollTo({ top: el.scrollTop - 220 }));
await shot("side-stuck", { wait: 800 });

// 4 · Full page, and back again
await page.getByRole("link", { name: "Open in full chat" }).click();
await shot("full-chat", { wait: 1500 });
await page.getByRole("link", { name: /Started from/ }).click();
await shot("back-to-dashboard", { wait: 9000 });

// 5 · The new chat in history, filtered by the report it started from
await railLink("Chats").click();
await page.getByRole("link", { name: /Which product category/ }).click();
await page.getByPlaceholder("Search or filter chats").click();
await page.getByRole("option", { name: /Report/ }).click();
await shot("filter-report-menu", { wait: 600 });
await page.getByRole("option", { name: /Storefront overview/ }).click();
await shot("filter-report", { wait: 800 });

// 6 · A notebook
await go("/reports/storefront/notebook/notebooks/category-review.malloy");
await page.mouse.move(900, 300);
await shot("notebook", { wait: 9000 });
await ask("Summarize what this notebook says about returns, in two sentences.");
await awaitReply();
await shot("notebook-answer", { wait: 2500 });

await browser.close();
