// Re-takes the screenshots in img/. Needs Publisher on :4000 (bun run start)
// and, for the Console shots, the dev Console on :5173 (bun run start:dev:react).
//   node docs/unboxing/capture.mjs [name ...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "img");
mkdirSync(out, { recursive: true });

const PKG = "http://localhost:4000/environments/examples/packages";
const QF = `${PKG}/questionable-football`;
const SR = `${PKG}/signals-research`;

const shots = [
   { name: "qf-cheatsheet", url: `${QF}/index.html` },
   { name: "qf-leaders", url: `${QF}/leaders.html?season=2025&pos=RB` },
   { name: "qf-player", url: `${QF}/player.html?player=HurtJa00` },
   { name: "qf-teams", url: `${QF}/teams.html?team=PHI` },
   { name: "qf-finding", url: `${QF}/apps/the-tight-end-cliff/index.html` },
   { name: "sr-screener", url: `${SR}/index.html` },
   { name: "sr-ticker", url: `${SR}/ticker.html?symbol=GOOGL` },
   { name: "sr-lab", url: `${SR}/lab.html?signal=put_call_spike` },
   {
      name: "sr-finding",
      url: `${SR}/apps/risk-on-dips-got-bought/index.html`,
   },
   {
      name: "prior-qf",
      url: "https://data.questionablefootball.com",
      wait: 6000,
      click: 'button[aria-label="Toggle light/dark mode"]',
   },
   { name: "prior-stocks", url: "https://stocks.getobjective.app", wait: 6000 },
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
   try {
      // The package pages hold a connection open, so they never reach networkidle.
      await page.goto(shot.url, { waitUntil: "load", timeout: 60000 });
   } catch (error) {
      console.warn(`${shot.name}: ${error.message.split("\n")[0]}`);
   }
   await page.waitForTimeout(shot.wait ?? 5000);
   if (shot.click) {
      await page.click(shot.click);
      await page.waitForTimeout(1000);
   }
   await page.screenshot({ path: join(out, `${shot.name}.png`) });
   await page.screenshot({
      path: join(out, `${shot.name}-full.png`),
      fullPage: true,
   });
   console.log(`ok ${shot.name}`);
   await page.close();
}

await browser.close();
