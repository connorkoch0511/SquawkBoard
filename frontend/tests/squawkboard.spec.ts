import { test, expect, type Page } from "@playwright/test";

// Render free tier can take ~35s to wake from sleep — all tests share this wait.
const BACKEND_TIMEOUT = 40_000;

async function waitForLiveData(page: Page) {
  await page.goto("/");
  // Wait for WebSocket to connect and data to arrive
  await expect(page.locator("span", { hasText: "LIVE" })).toBeVisible({
    timeout: BACKEND_TIMEOUT,
  });
  // At least one flight marker on the map
  await page.waitForSelector(".leaflet-marker-icon", { timeout: 10_000 });
}

test("stats bar shows live connection and flight counts", async ({ page }) => {
  await waitForLiveData(page);

  await expect(page.getByText("SQUAWKBOARD", { exact: true })).toBeVisible();
  await expect(page.getByText("FLIGHTS", { exact: true })).toBeVisible();
  await expect(page.getByText("EN ROUTE", { exact: true })).toBeVisible();
  await expect(page.getByText("AVG ALT", { exact: true })).toBeVisible();

  await page.screenshot({ path: "tests/screenshots/01-stats-bar.png" });
});

test("map renders 40 flight markers", async ({ page }) => {
  await waitForLiveData(page);

  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(40, {
    timeout: 10_000,
  });

  await page.screenshot({ path: "tests/screenshots/02-map-markers.png" });
});

test("clicking a marker opens the flight detail panel", async ({ page }) => {
  await waitForLiveData(page);

  await page.locator(".leaflet-marker-icon").first().click();

  await expect(page.getByText("SQUAWK", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("ALTITUDE", { exact: true })).toBeVisible();
  await expect(page.getByText("SPEED", { exact: true })).toBeVisible();
  await expect(page.getByText("HEADING", { exact: true })).toBeVisible();

  await page.screenshot({ path: "tests/screenshots/03-detail-panel.png" });
});

test("closing the detail panel hides it", async ({ page }) => {
  await waitForLiveData(page);

  await page.locator(".leaflet-marker-icon").first().click();
  await expect(page.getByText("ALTITUDE", { exact: true })).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("ALTITUDE", { exact: true })).not.toBeVisible({ timeout: 5_000 });

  await page.screenshot({ path: "tests/screenshots/04-panel-closed.png" });
});

test("sidebar opens and lists all 40 flights", async ({ page }) => {
  await waitForLiveData(page);

  await page.getByRole("button", { name: "Toggle flight list" }).click();
  await expect(page.getByPlaceholder(/search callsign/i)).toBeVisible();
  await expect(page.locator("text=40 of 40 flights")).toBeVisible({ timeout: 8_000 });

  await page.screenshot({ path: "tests/screenshots/05-sidebar-open.png" });
});

test("sidebar search filters flights by callsign prefix", async ({ page }) => {
  await waitForLiveData(page);

  await page.getByRole("button", { name: "Toggle flight list" }).click();
  await page.waitForSelector("text=40 of 40 flights", { timeout: 8_000 });

  // All callsigns start with a 3-letter airline code — AAL is American Airlines
  await page.fill("input[placeholder]", "AAL");
  const countLocator = page.locator("text=/ of 40 flights/");
  await expect(countLocator).toBeVisible({ timeout: 5_000 });
  const text = await countLocator.textContent();
  const n = parseInt(text!);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(40);

  await page.screenshot({ path: "tests/screenshots/06-sidebar-search.png" });
});

test("sidebar status filter shows only climbing flights", async ({ page }) => {
  await waitForLiveData(page);

  await page.getByRole("button", { name: "Toggle flight list" }).click();
  await page.waitForSelector("text=40 of 40 flights", { timeout: 8_000 });

  await page.getByRole("button", { name: "Climbing", exact: true }).click();
  const countLocator = page.locator("text=/ of 40 flights/");
  await expect(countLocator).toBeVisible({ timeout: 5_000 });
  const text = await countLocator.textContent();
  expect(parseInt(text!)).toBeLessThan(40);

  await page.screenshot({ path: "tests/screenshots/07-sidebar-filter.png" });
});

test("clicking a sidebar row selects the flight and opens the detail panel", async ({ page }) => {
  await waitForLiveData(page);

  await page.getByRole("button", { name: "Toggle flight list" }).click();
  await page.waitForSelector("text=40 of 40 flights", { timeout: 8_000 });

  // Click the first row and capture its callsign
  const firstRow = page.locator("div.overflow-y-auto button").first();
  const callsign = await firstRow.locator(".text-cyan-400.font-bold").textContent();
  await firstRow.click();

  // Detail panel should show that callsign as the title
  await expect(page.locator(`text=${callsign?.trim()}`).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("SQUAWK", { exact: true })).toBeVisible();

  await page.screenshot({ path: "tests/screenshots/08-sidebar-select.png" });
});
