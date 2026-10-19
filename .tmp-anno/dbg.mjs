import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext(".tmp-anno/dd-profile", { channel: "chrome" });
const page = ctx.pages()[0];
await page.goto("http://127.0.0.1:5180/examples/storefront/coverage");
const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("coverage:examples/storefront") ?? "[]"));
const r = runs[0];
console.log(r.domain, r.score, JSON.stringify(r.counts));
for (const q of r.questions) console.log(`${r.results[q.id]?.status ?? "FAILED"} | ${q.category} | ${q.persona} | ${q.text} | ${q.concepts.map(c=>c.type+':'+c.text).join(', ')}`);
await ctx.close();
