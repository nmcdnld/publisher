import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto("file://" + process.cwd() + "/docs/unboxing/data-dictionary.html");
await p.waitForLoadState("load");
const h = await p.evaluate(() => document.body.scrollHeight);
console.log("height", h);
for (const [i, y] of [0, 2600, 5200, 9000, 13000, 17000].entries()) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.screenshot({ path: `.tmp-anno/render-${i}.png` });
}
const broken = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
console.log("broken", broken);
await b.close();
