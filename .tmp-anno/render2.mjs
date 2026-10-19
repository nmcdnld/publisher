import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto("file://" + process.cwd() + "/docs/unboxing/data-dictionary.html");
for (const [n, sel] of [["a", 'img[src$="rescore-score.png"]'], ["b", 'img[src$="rescore-margin.png"]']]) {
  await p.locator(sel).scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -250));
  await p.screenshot({ path: `.tmp-anno/render2-${n}.png` });
}
await b.close();
