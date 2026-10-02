// Renders the 1200x630 link-preview cards (og:image) for the two unboxing pages.
//   node docs/unboxing/og.mjs
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "img");

const cards = [
   {
      file: "og-part1.png",
      part: "Part 1 of 2",
      title: "Unboxing Publisher and adding Question mode",
      dek: "Two existing data projects rebuilt as Publisher packages, and a new way to ask a question in the explorer.",
      tags: ["Example packages", "HTML data apps", "Question mode"],
   },
   {
      file: "og-part2.png",
      part: "Part 2 of 2",
      title: "Credible demo workspace: a front door for Publisher",
      dek: "A library filled from the workspace's packages, AI-drafted insights, and saving anything worth keeping back to its package.",
      tags: ["Library", "AI insights", "Save to package", "Theming"],
   },
];

const html = (c) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root {
    --ink: #16181d; --ink-2: #4a505c; --ink-3: #7b8190; --rule: #e3e5ea;
    --wash: #f6f7f9; --accent: #1f6feb; --accent-wash: #eaf2ff;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    --serif: "Iowan Old Style", "Charter", Georgia, serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; background: #fff; color: var(--ink); font-family: var(--sans); }
  .card { position: relative; height: 100%; padding: 72px 88px 64px 104px; display: flex; flex-direction: column; }
  .card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 16px; background: var(--accent); }
  .kicker { display: flex; gap: 14px; align-items: center; font: 600 20px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
  .kicker .part { color: var(--accent); background: var(--accent-wash); padding: 8px 12px; border-radius: 6px; }
  h1 { font: 600 72px/1.06 var(--serif); letter-spacing: -.015em; margin: 36px 0 24px; max-width: 980px; }
  .dek { font-size: 28px; line-height: 1.4; color: var(--ink-2); margin: 0; max-width: 960px; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; padding-top: 28px; border-top: 2px solid var(--rule); }
  .tags { display: flex; gap: 10px; }
  .tags span { font: 500 19px/1 var(--sans); color: var(--ink-2); background: var(--wash); border: 1px solid var(--rule); padding: 9px 14px; border-radius: 999px; }
  .by { font: 500 20px/1 var(--sans); color: var(--ink-3); }
</style></head><body><div class="card">
  <div class="kicker"><span>Publisher unboxing</span><span class="part">${c.part}</span></div>
  <h1>${c.title}</h1>
  <p class="dek">${c.dek}</p>
  <div class="foot">
    <div class="tags">${c.tags.map((t) => `<span>${t}</span>`).join("")}</div>
    <div class="by">Noah Mac · Oct 2026</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cards) {
   await page.setContent(html(c));
   await page.screenshot({ path: join(out, c.file) });
   console.log(`wrote img/${c.file}`);
}
await browser.close();
