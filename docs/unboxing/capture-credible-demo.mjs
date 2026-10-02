// Screenshots of the Credible Demo app for credible-demo.html.
// Needs Publisher on :4000 (bun run start) and the Credible Demo dev server on
// :5180 (cd packages/credible-demo && bun run dev).
//   node docs/unboxing/capture-credible-demo.mjs [name ...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "img", "credible-demo");
mkdirSync(out, { recursive: true });
const APP = process.env.CREDIBLE_DEMO_URL ?? "http://localhost:5180";
const PUBLISHER = process.env.PUBLISHER_URL ?? "http://localhost:4000";

const shots = [
   { name: "discover", path: "/" },
   { name: "library-personal", path: "/library" },
   { name: "library-workspace", path: "/library?scope=workspace" },
   { name: "studio", path: "/studio" },
   { name: "chat", path: "/chat" },
   { name: "publish", path: "/publish" },
   {
      name: "publisher-saved-insight",
      url: `${PUBLISHER}/examples/storefront/data-apps/apps/revenue-growth-by-year/index.html`,
   },
];

const only = new Set(process.argv.slice(2));
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
   viewport: { width: 1440, height: 900 },
   deviceScaleFactor: 2,
});

for (const shot of shots) {
   if (only.size && !only.has(shot.name)) continue;
   const page = await context.newPage();
   await page.goto(shot.url ?? APP + shot.path, { waitUntil: "load", timeout: 60000 });
   await page.waitForTimeout(shot.wait ?? 4000);
   await page.screenshot({ path: join(out, `${shot.name}.png`) });
   console.log(`ok ${shot.name}`);
   await page.close();
}

await browser.close();
