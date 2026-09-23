import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "product");
const baseURL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";

const AUTH = {
  email: "name@company.ru",
  name: "Александр",
  authenticated: true,
};

async function waitReady(page: import("playwright").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
}

async function shot(page: import("playwright").Page, name: string) {
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    type: "png",
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });

  await page.addInitScript((session) => {
    window.localStorage.setItem("platform.auth", JSON.stringify(session));
    window.localStorage.setItem("platform.theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  }, AUTH);

  await page.goto(`${baseURL}/app`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shot(page, "dashboard");

  await page.goto(`${baseURL}/app/tables`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shot(page, "tables");

  await page.goto(`${baseURL}/app/tables/demo-russian-saas`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-capture='table-editor']");
  await page.waitForSelector("[data-capture='spreadsheet']");
  await page.locator("[data-capture='spreadsheet']").evaluate((el) => {
    (el as HTMLElement).scrollLeft = 1080;
  });
  await waitReady(page);
  await shot(page, "table-editor");

  await page.getByRole("button", { name: "Добавить колонку" }).click();
  await page.waitForTimeout(300);
  await shot(page, "add-column");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.locator("[data-capture='enrich']").click();
  const enrichDialog = page.getByRole("dialog");
  await enrichDialog.waitFor();
  await enrichDialog.getByRole("button", { name: /Email waterfall/i }).click();
  await page.getByRole("dialog", { name: "Email waterfall" }).waitFor();
  await page.waitForTimeout(350);
  await shot(page, "waterfall");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.locator("[data-capture='ai']").click();
  await page.getByRole("dialog", { name: "AI Column" }).waitFor();
  await page.waitForTimeout(350);
  await shot(page, "ai-column");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.locator("[data-capture='run']").click();
  await page.getByRole("button", { name: "Run" }).last().click();
  await page.waitForSelector("[data-capture='run-bar']", { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  await shot(page, "run-state");

  await page.goto(`${baseURL}/app/signals`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shot(page, "signals");

  await page.goto(`${baseURL}/app/integrations`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shot(page, "integrations");

  await page.goto(`${baseURL}/app/audiences`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shot(page, "audiences");

  await browser.close();
  console.log(`Captured product screenshots → ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
