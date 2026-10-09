import {test, expect, type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";

const project = {project_id: "deleted-pack", provider: "modrinth", title: "Deleted pack", description: "Install lifecycle", downloads: 100, project_type: "modpack", versions: ["1.21.1"], categories: ["fabric"]};
const nav = (page: Page, name: string) => page.locator(".sidebar").getByRole("button", {name, exact: true});
const card = (page: Page) => page.locator('.discover-page [data-project-id="modrinth:deleted-pack"]');

test("deleting a pack clears Home, catalog and detail badges and permits reinstall with a stale legacy cache", async ({page}) => {
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.addInitScript(project => {
    localStorage.setItem("canary-language", "en");
    localStorage.setItem("canary-visual", JSON.stringify({showCommunity: true}));
    localStorage.setItem("canary-library", JSON.stringify([project]));
  }, project);
  await page.route("https://api.modrinth.com/v2/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/search")) return route.fulfill({json: {hits: [project], total_hits: 1}});
    if (path.endsWith("/version")) return route.fulfill({json: [{id: "pack-v1", name: "1.0", version_number: "1.0", game_versions: ["1.21.1"], loaders: ["fabric"], files: [{filename: "pack.mrpack", url: "https://example.org/pack.mrpack"}]}]});
    if (path.endsWith("/project/deleted-pack")) return route.fulfill({json: {...project, id: project.project_id, body: "Install lifecycle", gallery: [], game_versions: ["1.21.1"], loaders: ["fabric"]}});
    return route.fulfill({json: []});
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const qa = (globalThis as any).__materialQA;
    Object.assign(qa.state.instances[0], {project_id: "deleted-pack", name: "Deleted pack"});
    qa.overrides = {delete_instance: ({id}: {id: string}) => {qa.state.instances = qa.state.instances.filter((instance: any) => instance.id !== id);}};
    const {emit} = await import("/node_modules/@tauri-apps/api/event.js" as string);
    await emit("instances-changed");
  });
  await expect(page.locator('.home-community [data-project-id="modrinth:deleted-pack"]').getByRole("button", {name: "Installed", exact: true})).toBeDisabled();
  await nav(page, "Discover").click();
  await expect(card(page).getByRole("button", {name: "Installed", exact: true})).toBeDisabled();
  await nav(page, "Library").click();
  await page.locator(".instance-card").filter({hasText: "Deleted pack"}).getByRole("button", {name: "Details", exact: true}).click();
  await page.locator(".instance-surface").getByRole("button", {name: "Delete instance", exact: true}).click();
  await page.getByRole("dialog", {name: "Delete instance", exact: true}).getByRole("button", {name: "Confirm", exact: true}).click();
  await expect(page.locator(".instance-card").filter({hasText: "Deleted pack"})).toHaveCount(0);
  await nav(page, "Home").click();
  await expect(page.locator('.home-community [data-project-id="modrinth:deleted-pack"]').getByRole("button", {name: "Install", exact: true})).toBeEnabled();
  await nav(page, "Discover").click();
  await expect(card(page).getByRole("button", {name: "Install", exact: true})).toBeEnabled();
  await card(page).locator(".card-title").click();
  await expect(page.locator(".detail-actions").getByRole("button", {name: "Install", exact: true})).toBeEnabled();
  await page.locator(".detail-actions").getByRole("button", {name: "Install", exact: true}).click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__materialQA.installs?.length ?? 0)).toBe(1);
  await page.evaluate(() => (globalThis as any).__materialQA.completeInstall(0));
  await expect(page.locator(".instance-card").filter({hasText: "Deleted pack"})).toHaveCount(1);
  await nav(page, "Discover").click();
  await expect(card(page).getByRole("button", {name: "Installed", exact: true})).toBeDisabled();
});

test("a deleted pack stays installable after restart even when its old cache persists", async ({page}) => {
  await nativeFixture(page);
  await page.addInitScript(project => {
    localStorage.setItem("canary-language", "en");
    localStorage.setItem("canary-library", JSON.stringify([project]));
  }, project);
  await page.route("https://api.modrinth.com/v2/search*", route => route.fulfill({json: {hits: [project], total_hits: 1}}));
  await page.goto("/");
  await nav(page, "Discover").click();
  await expect(card(page).getByRole("button", {name: "Install", exact: true})).toBeEnabled();
  await page.reload();
  await nav(page, "Discover").click();
  await expect(card(page).getByRole("button", {name: "Install", exact: true})).toBeEnabled();
});
