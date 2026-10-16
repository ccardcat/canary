import {test, expect, type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {mkdirSync} from "node:fs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=", "base64");
const tags = ["optimization", "multiplayer", "adventure", "challenging", "combat", "lightweight", "magic", "quests", "technology", "vanilla-like", "kitchen-sink", "new-category"];
async function catalog(page: Page) {
  const searches: string[][][] = [];
  await page.route("https://api.modrinth.com/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/tag/category")) return route.fulfill({json: tags.map(name => ({name, project_type: "modpack", header: "categories"}))});
    if (url.pathname.endsWith("/tag/game_version")) return route.fulfill({json: [{version: "1.21.1", version_type: "release"}]});
    searches.push(JSON.parse(url.searchParams.get("facets") || "[]"));
    return route.fulfill({json: {hits: [{project_id: "fo", title: "Fabulously Optimized — A long readable project name", author: "Community", description: "An optimized Minecraft experience with a description that remains readable in every catalog layout.", downloads: 1200000, follows: 1234, date_modified: "2026-09-01T00:00:00Z", icon_url: "https://cdn.modrinth.com/qa/logo.png", categories: ["fabric", "forge", ...tags], versions: ["1.21.1"], client_side: "required"}], total_hits: 48}});
  });
  await page.route("https://cdn.modrinth.com/qa/**", route => route.fulfill({contentType: "image/png", body: png}));
  await page.goto("/");
  await page.getByRole("button", {name: "Discover", exact: true}).first().click();
  await expect(page.locator(".catalog-project-card")).toHaveCount(1);
  return searches;
}
test("catalog layout and detail settings persist without resetting search or pagination", async ({page}) => {
  const searches = await catalog(page);
  await expect(page.locator(".catalog-project-grid")).toHaveAttribute("data-layout", "list");
  await page.getByRole("button", {name: "Next", exact: true}).click();
  await expect(page.getByTestId("page-label")).toContainText("Page 2");
  await expect(page.locator(".catalog-project-card")).toHaveCount(1);
  const count = searches.length;
  await page.getByRole("button", {name: "Catalog grid", exact: true}).click();
  await expect(page.locator(".catalog-project-grid")).toHaveAttribute("data-layout", "grid");
  await expect(page.getByTestId("page-label")).toContainText("Page 2");
  expect(searches.length).toBe(count);
  await page.getByRole("button", {name: "Customize view"}).click();
  await page.getByLabel("Description", {exact: true}).uncheck();
  await expect(page.locator(".catalog-project-card .card-body>p")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", {name: "Discover", exact: true}).first().click();
  await expect(page.locator(".catalog-project-grid")).toHaveAttribute("data-layout", "grid");
  await expect(page.locator(".catalog-project-card .card-body>p")).toHaveCount(0);
});
test("all categories can be searched, multiple selections produce real AND/OR facets", async ({page}) => {
  const searches = await catalog(page);
  await page.getByRole("button", {name: "Filters", exact: false}).click();
  const popover = page.locator(".catalog-filter-popover");
  await expect(popover.locator('.category-checklist input[type="checkbox"]')).toHaveCount(12);
  await popover.getByLabel("Optimization", {exact: true}).check();
  await popover.getByLabel("Multiplayer", {exact: true}).check();
  await expect.poll(() => searches.at(-1)).toContainEqual(["categories:optimization"]);
  await expect.poll(() => searches.at(-1)).toContainEqual(["categories:multiplayer"]);
  await popover.getByLabel("Find a tag").fill("new");
  await expect(popover.locator('.category-checklist input[type="checkbox"]')).toHaveCount(1);
  await expect(popover.getByLabel("New Category", {exact: true})).toBeVisible();
  await popover.getByRole("combobox", {name: "Match tags", exact: true}).click();
  await page.getByRole("option", {name: "Any selected", exact: true}).click();
  await expect.poll(() => searches.at(-1)).toContainEqual(["categories:optimization", "categories:multiplayer"]);
  await popover.getByRole("button", {name: "Reset", exact: true}).click();
  await expect.poll(() => searches.at(-1)).toEqual([["project_type:modpack"]]);
});
for (const mode of ["light", "dark", "amoled"]) test(`catalog rows and grid fit narrow windows in ${mode}`, async ({page}) => {
  mkdirSync(".qa/catalog", {recursive: true});
  await page.addInitScript(mode => {localStorage.setItem("canary-mode", mode); localStorage.setItem("canary-visual", JSON.stringify({fontScale: 120, materialPreset: "glass", backgroundSource: "solid"}));}, mode);
  await page.setViewportSize({width: 760, height: 800});
  await catalog(page);
  const card = page.locator(".catalog-project-card");
  await card.getByRole("button", {name: "Show all tags"}).click();
  await expect(card).toContainText("New Category");
  const fabric = card.locator(".loader-fabric"), forge = card.locator(".loader-forge");
  expect(await fabric.evaluate(el => getComputedStyle(el).color)).not.toBe(await forge.evaluate(el => getComputedStyle(el).color));
  for (const layout of ["list", "grid"]) {
    await page.getByRole("button", {name: `Catalog ${layout}`, exact: true}).click();
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: `.qa/catalog/${mode}-${layout}.png`});
  }
});
test("Home and library share restored project icons, navigation opens the overview and nickname input fits", async ({page}) => {
  await nativeFixture(page);
  let iconRequests = 0;
  await page.route("https://api.modrinth.com/v2/project/fo", route => {iconRequests++; return route.fulfill({json: {icon_url: "https://cdn.modrinth.com/qa/logo.png"}});});
  await page.route("https://cdn.modrinth.com/qa/**", route => route.fulfill({contentType: "image/png", body: png}));
  await page.goto("/");
  await page.evaluate(async () => {
    Object.assign((globalThis as any).__materialQA.state.instances[0], {project_id: "fo", icon: undefined});
    const {emit} = await import("/node_modules/@tauri-apps/api/event.js"); await emit("instances-changed");
  });
  const homeCard = page.locator('.continuation-card[data-instance-id="instance-0"]');
  await expect(homeCard.locator(".continue-art img")).toHaveAttribute("src", "https://cdn.modrinth.com/qa/logo.png");
  await expect(homeCard.locator(".continue-status")).toHaveCount(0);
  await homeCard.locator(".continue-art").click();
  await expect(page.locator(".library-overview")).toBeVisible();
  await expect(page.locator(".instance-surface")).toHaveCount(0);
  const instance = page.locator('[data-instance-id="instance-0"]');
  await expect(instance.locator(".instance-small-icon img")).toHaveAttribute("src", "https://cdn.modrinth.com/qa/logo.png");
  await expect.poll(() => instance.locator(".instance-small-icon img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(iconRequests).toBe(1);
  await expect(instance.locator(".chips")).toHaveCount(0);
  await expect(instance).not.toContainText("Ready");
  await expect(instance).not.toContainText("modrinth");
  await expect(page.locator('[data-instance-id="instance-1"] .running-status')).toBeVisible();
  await page.locator(".account-button").click();
  const input = page.locator(".local-account-form input");
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.width).toBeGreaterThan(230);
  await input.fill("CanaryUser_12345");
  await expect(input).toHaveValue("CanaryUser_12345");
});
