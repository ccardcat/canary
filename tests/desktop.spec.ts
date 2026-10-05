import { test, expect, type Page } from "@playwright/test";
const project = (i: number) => ({
  project_id: `pack-${i}`,
  slug: `pack-${i}`,
  title: `Project ${i}`,
  description: "A Minecraft community project",
  downloads: 10000 + i,
  project_type: "modpack",
  categories: ["adventure"],
  versions: ["1.21.1"],
});
const version = (id: string) => ({
  id,
  version_number: "1.0",
  game_versions: ["1.21.1"],
  loaders: ["fabric"],
  files: [
    { filename: "pack.mrpack", url: "https://cdn.modrinth.com/pack.mrpack" },
  ],
  date_published: "2026-01-01",
  changelog: "## Updates\n\n**New** content.",
});
async function mockApi(page: Page) {
  await page.route("https://api.modrinth.com/v2/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search")) {
      const offset = Number(url.searchParams.get("offset"));
      const delay = url.searchParams.get("query") === "old" ? 900 : 25;
      await new Promise((r) => setTimeout(r, delay));
      await route.fulfill({
        json: {
          hits: Array.from({ length: 12 }, (_, i) => ({
            ...project(offset + i + 1),
            title:
              (url.searchParams.get("query") === "old" ? "STALE " : "") +
              project(offset + i + 1).title,
          })),
          total_hits: 96,
        },
      });
    } else if (url.pathname.endsWith("/version")) {
      await route.fulfill({ json: [version("version-1")] });
    } else {
      await route.fulfill({
        json: {
          ...project(1),
          id: "pack-1",
          followers: 200,
          updated: "2026-01-01",
          game_versions: ["1.21.1"],
          gallery: [],
          body: "## Real heading\n\nA **bold** word and *emphasis*.\n\n- First\n- Second\n\n> Quote\n\n`inline`\n\n```js\nconst x = 1;\n```\n\n---\n\n[Safe](https://modrinth.com) [Bad](javascript:alert(1))\n\n<script>window.unsafeMarkdown = true</script>\n\n![image](https://cdn.modrinth.com/test.png)",
        },
      });
    }
  });
  await page.route("https://cdn.modrinth.com/**", (route) =>
    route.fulfill({ status: 404 }),
  );
}
async function discover(page: Page) {
  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  await expect(page.locator(".project-card")).toHaveCount(12);
  await expect(page.getByTestId("page-label")).toHaveText("Page 1 / 8");
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});
test("pagination keeps results and offset through 1 → 2 → 3 → 2 → 1", async ({
  page,
}) => {
  const offsets: number[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/search?"))
      offsets.push(Number(new URL(r.url()).searchParams.get("offset")));
  });
  await discover(page);
  for (const [button, number, title] of [
    ["Next", 2, "Project 13"],
    ["Next", 3, "Project 25"],
    ["Previous", 2, "Project 13"],
    ["Previous", 1, "Project 1"],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByTestId("page-label")).toHaveText(
      `Page ${number} / 8`,
    );
    await expect(page.locator(".card-title").first()).toHaveText(title);
  }
  expect(offsets.slice(-4)).toEqual([12, 24, 12, 0]);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
});
test("query, sort, filters and type reset only when changed; stale queries cannot replace results", async ({
  page,
}) => {
  await discover(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card-title").first()).toHaveText("Project 13");
  const oldRequest = page.waitForRequest((r) => r.url().includes("query=old"));
  await page.getByRole("textbox", { name: "Search projects" }).fill("old");
  await oldRequest;
  await page.getByRole("textbox", { name: "Search projects" }).fill("new");
  await expect(page.getByTestId("page-label")).toHaveText("Page 1 / 8");
  await expect(page.locator(".card-title").first()).toHaveText("Project 1");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card-title").first()).toHaveText("Project 13");
  await page.getByRole("button", { name: "Playing as", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000); // Allow the deliberately slower old response to finish.
  await expect(page.getByTestId("page-label")).toHaveText("Page 2 / 8");
  await expect(page.locator(".card-title").first()).toHaveText("Project 13");
  const sorted = page.waitForRequest(
    (r) => r.url().includes("index=updated") && r.url().includes("offset=0"),
  );
  await page.getByLabel("Sort", { exact: true }).selectOption("updated");
  await sorted;
  await expect(page.getByTestId("page-label")).toHaveText("Page 1 / 8");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filtered = page.waitForRequest((r) =>
    decodeURIComponent(r.url()).includes("categories:fabric"),
  );
  await page
    .locator(".filter-popover")
    .getByRole("combobox", { name: "Loader", exact: true })
    .selectOption("fabric");
  await filtered;
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Mods", exact: true }).click();
  await expect(page.locator(".card-title").first()).toHaveText("Project 1");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card-title").first()).toHaveText("Project 13");
  await expect(page.getByTestId("page-label")).toHaveText("Page 2 / 8");
});
test("Home is separate, desktop window resizes without horizontal overflow", async ({
  page,
}) => {
  await expect(page.locator(".home-hero")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  for (const width of [1600, 1280, 1000, 800, 640, 480]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator(".content-shell")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      )
      .toBe(true);
  }
  await discover(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filterBox = await page.locator(".filter-popover").boundingBox();
  expect(filterBox!.x).toBeGreaterThanOrEqual(0);
  expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(480);
  await expect
    .poll(() =>
      page
        .locator(".content-shell")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
    .toBe(true);
});
test("account repeated click, outside click and Escape; Settings trap and live light theme", async ({
  page,
}) => {
  const button = page.getByRole("button", { name: "Playing as", exact: true });
  await button.click();
  await expect(page.locator(".account-popover")).toBeVisible();
  await button.click();
  await expect(page.locator(".account-popover")).toHaveCount(0);
  await button.click();
  await page.locator("h1").click();
  await expect(page.locator(".account-popover")).toHaveCount(0);
  await button.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".account-popover")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  // Theme materials transition together; assert their settled color.
  await expect.poll(() => page
    .locator(".settings-modal h2")
    .evaluate((el) => getComputedStyle(el).color)
  ).toBe("rgb(29, 36, 35)");
  await page.getByRole("button", { name: "Mint", exact: true }).click();
  expect(
    await page
      .locator(".toggle")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
  ).not.toBe("rgb(255, 255, 255)");
  await page
    .getByRole("switch", { name: "Reduce motion", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-modal")).toHaveCount(0);
});
test("Markdown renders safely; non-native installation explains required shell", async ({
  page,
}) => {
  await page.locator(".home-community .card-title").first().click();
  await expect(page.locator(".markdown h2")).toHaveText("Real heading");
  await expect(page.locator(".markdown strong")).toHaveText("bold");
  await expect(page.locator(".markdown blockquote")).toContainText("Quote");
  await expect(page.locator(".markdown pre code")).toContainText(
    "const x = 1;",
  );
  expect(
    await page.evaluate(() => Object.hasOwn(window, "unsafeMarkdown")),
  ).toBe(false);
  await expect(page.locator(".markdown a[href^='javascript:']")).toHaveCount(0);
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("desktop window");
});

test("structured install errors hide raw details, retry succeeds and persists the returned native path", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const mocks = await import("/node_modules/@tauri-apps/api/mocks.js");
    (globalThis as unknown as { isTauri: boolean }).isTauri = true;
    let attempts = 0;
    mocks.mockIPC((cmd: string) => {
      if(cmd === "backend_snapshot") return {
        instances:attempts>=2?[{id:"pack-1-version-1",name:"Project 1",provider:"modrinth",version_name:"1.0",minecraft:"1.21.1",loader:"fabric",directory:"/native/Canary/instances/pack-1-version-1",installed:1,playtime:0,favorite:false,status:"ready",overrides:{}}]:[],
        accounts:[],settings:{min_memory:512,max_memory:4096,jvm_args:[],game_args:[]},activity:[],data_folder:"/native/Canary",providers:{}
      };
      if (cmd !== "install_modpack") return;
      if (++attempts === 1)
        throw {
          stage: "apply_overrides",
          message: "Directory write failed",
          path: "C:/Canary/config",
          os_error: 5,
          causes: ["Access denied"],
        };
      return "/native/Canary/instances/pack-1-version-1";
    });
  });
  await page.locator(".home-community .install-action").first().click();
  const toast = page.getByRole("alert");
  await expect(toast).toContainText("Installation failed");
  await expect(toast).not.toContainText("Directory write failed");
  await toast.getByRole("button", { name: "Details", exact: true }).click();
  await expect(toast.locator("pre")).toContainText("apply_overrides");
  await expect(toast.locator("pre")).toContainText("Access denied");
  await toast.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Library");
  await expect(page.locator(".library-grid .chips")).toContainText("Ready");
  await expect(page.locator(".library-grid").getByRole("button", {name:"Play",exact:true})).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("canary-library") || "[]")[0]
          .instance_path,
    ),
  ).toBe("/native/Canary/instances/pack-1-version-1");
  await page
    .getByRole("button", { name: "Downloads", exact: true })
    .first()
    .click();
  await expect(page.locator(".download-stage strong")).toHaveText("100%");
  await expect(page.locator(".downloads-page h2")).toHaveText(
    "Installation complete",
  );
});

test("System responds live, AMOLED remains black, and OS reduced motion stops ambient motion", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "AMOLED", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "amoled");
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--bg").trim()),
  ).toBe("#000");
  await page.locator(".mode-grid").getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await expect(page.locator(".brand img")).toHaveAttribute(
    "src",
    "/branding/canary-bird-black.png",
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator(".brand img")).toHaveAttribute(
    "src",
    "/branding/canary-bird-white.png",
  );
  expect(
    await page
      .locator(".sidebar-art")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest(".settings-modal"),
    ),
  ).toBe(true);
});
