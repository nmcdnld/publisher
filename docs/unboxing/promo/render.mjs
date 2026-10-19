// Renders promo.html frame by frame and encodes it with ffmpeg.
//   node render.mjs                     -> sidebar-chat-promo.mp4 (needs music.wav, see music.mjs)
//   node render.mjs --stills 5,15.6,31  -> stills/promo-<t>.png for review
// Set FFMPEG to the ffmpeg binary if it isn't on PATH.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const args = process.argv.slice(2);
const stills = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;

const browser = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(pathToFileURL(join(here, "promo.html")).href + "?render=1");
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const stage = page.locator("#stage");

if (stills) {
  mkdirSync(join(here, "stills"), { recursive: true });
  for (const t of stills) {
    await page.evaluate((t) => window.seek(t), t);
    await stage.screenshot({ path: join(here, "stills", `promo-${t}.png`) });
  }
  console.log(`wrote ${stills.length} stills`);
} else {
  const ffmpeg = spawn(process.env.FFMPEG ?? "ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-i", join(here, "music.wav"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-shortest",
    join(here, "sidebar-chat-promo.mp4"),
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const jpg = await stage.screenshot({ type: "jpeg", quality: 95 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ffmpeg.stdin.end();
  await new Promise((r, j) => ffmpeg.on("close", (c) => (c ? j(new Error(`ffmpeg exited ${c}`)) : r())));
  console.log("wrote sidebar-chat-promo.mp4");
}
await browser.close();
