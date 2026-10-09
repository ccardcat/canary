import { test, expect, type Page } from "@playwright/test";
import { nativeFixture } from "./helpers/nativeFixture";
import { mkdirSync } from "node:fs";
test.use({
  launchOptions: {
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});
const nav = (page: Page, name: string) =>
  page.locator(".sidebar nav").getByRole("button", { name, exact: true });
async function setup(page: Page) {
  await nativeFixture(page);
  await page.goto("/");
  await expect(page.locator(".home-greeting")).toBeVisible();
}
async function emitTask(page: Page, patch: Record<string, unknown> = {}) {
  return page.evaluate(async (patch) => {
    const { emit } = await import(
      "/node_modules/@tauri-apps/api/event.js" as string
    );
    const task = {
      id: crypto.randomUUID(),
      operationId: "new-pack",
      instanceId: "new-pack",
      kind: "install",
      title:
        "A very long Minecraft project name that must stay inside its surface",
      status: "running",
      stage: "libraries",
      startedAt: Date.now() / 1000,
      updatedAt: Date.now() / 1000,
      revision: 1,
      cancellable: true,
      cancelRequested: false,
      completed: 43,
      total: 97,
      downloaded: 61 * 1048576,
      bytesTotal: 92 * 1048576,
      percent: 67,
      speed: 1024 * 1024,
      currentFile:
        "lwjgl-freetype-3.4.1-natives-windows-with-a-very-long-name.jar",
      ...patch,
    };
    await emit("activity-task", task);
    return task;
  }, patch);
}
async function finish(page: Page, task: any, status: string) {
  await page.evaluate(
    async ({ task, status }) => {
      const { emit } = await import(
        "/node_modules/@tauri-apps/api/event.js" as string
      );
      await emit("activity-task", {
        ...task,
        status,
        cancellable: false,
        revision: 2,
        currentFile: "",
        updatedAt: Date.now() / 1000,
        error:
          status === "failed"
            ? { code: "network", message: "The connection was interrupted" }
            : undefined,
      });
    },
    { task, status },
  );
}
test("terminal cancellation and failure clear Downloads; late events cannot resurrect a task", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Downloads").click();
  const task = await emitTask(page);
  const active = page.locator(".activity-active");
  await expect(active).toContainText("43 / 97");
  await expect(active.locator("progress")).toHaveAttribute("value", "67");
  await finish(page, task, "cancelled");
  await expect(active.locator(".activity-task")).toHaveCount(0);

  await page.evaluate(async (task) => {
    const { emit } = await import(
      "/node_modules/@tauri-apps/api/event.js" as string
    );
    await emit("activity-task", {
      ...task,
      revision: 99,
      status: "running",
      percent: 99,
    });
  }, task);
  await expect(active.locator(".activity-task")).toHaveCount(0);
  const failed = await emitTask(page);
  await finish(page, failed, "failed");
  await expect(active.locator(".activity-task")).toHaveCount(0);
  await nav(page, "Library").click();
  await expect(page.locator('[data-instance-id="new-pack"]')).toHaveCount(0);
});
test("closing a creation dialog preserves task; cancel waits for native command and allows retry", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    () => ((globalThis as any).__materialQA.deferCancel = true),
  );
  await nav(page, "Library").click();
  await page.getByRole("button", { name: "New instance", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Cancelled pack");
  await dialog
    .getByRole("button", { name: "New instance", exact: true })
    .click();
  await expect(dialog.locator(".activity-task")).toContainText("43 / 97");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (globalThis as any).__materialQA.calls.filter(
          (c: any) => c.command === "cancel_operation",
        ).length,
    ),
  ).toBe(0);
  await nav(page, "Downloads").click();
  await expect(page.locator(".activity-active .activity-task")).toHaveCount(1);
  await page
    .locator(".activity-active")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".activity-active")).toContainText("Cancelling…");
  await expect(
    page
      .locator(".activity-active")
      .getByRole("button", { name: "Cancelling…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".activity-active .activity-task")).toHaveCount(0);

  const calls = await page.evaluate(
    () => (globalThis as any).__materialQA.calls,
  );
  const create = calls.find((c: any) => c.command === "create_instance");
  const cancel = calls.find((c: any) => c.command === "cancel_operation");
  expect(cancel.args.id).toBe(create.args.taskId);
  expect(cancel.args.id).not.toBe(create.args.requestId);
  await nav(page, "Library").click();
  await expect(page.locator(".instance-card")).toHaveCount(9);
  await page.getByRole("button", { name: "New instance", exact: true }).click();
  await page.getByRole("dialog").locator("input").first().fill("Retry pack");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "New instance", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".activity-task"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".activity-task")).toHaveCount(
    0,
  );
});
test("Downloads keeps simultaneous tasks and disables cancellation during commit", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Downloads").click();
  const first = await emitTask(page);
  const second = await emitTask(page, {
    operationId: "second",
    title: "Second pack",
    kind: "update",
    cancellable: false,
    stage: "finalize",
  });
  const active = page.locator(".activity-active");
  await expect(active.locator(".activity-task")).toHaveCount(2);
  await expect(
    active.getByRole("button", { name: "Finishing…", exact: true }),
  ).toBeDisabled();
  await expect(active).toContainText("Second pack");
  await finish(page, first, "completed");
  await expect(active.locator(".activity-task")).toHaveCount(1);
  await finish(page, second, "failed");
  await expect(active.locator(".activity-task")).toHaveCount(0);
  await page.locator(".activity-recent summary").click();
  await expect(page.locator(".activity-recent progress")).toHaveCount(0);
  await expect(page.locator(".activity-recent .activity-file")).toHaveCount(0);
});
test("Dock is absent and old Dock preferences migrate without losing appearance", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "canary-visual",
      JSON.stringify({
        showActivityDock: true,
        showGameActivity: true,
        showDownloadProgress: false,
        showActivityNames: false,
        showCommunity: false,
        font: "Monocraft",
        fontScale: 120,
        minecraft: "full",
        sidebarSide: "right",
        sidebarMode: "floating",
        materialStyle: "liquid",
        materialLinked: true,
        app: "sakura1",
        cursor: "system",
      }),
    );
  });
  await setup(page);
  await expect(page.locator(".sidebar-bottom > button")).toHaveCount(2);
  const sidebar = page.locator(".sidebar");
  await sidebar.hover();
  await page.locator(".sidebar-bottom > button").first().focus();
  await page.waitForTimeout(300);
  await expect(
    page.locator(
      ".activity-dock,.activity-popover,.activity-ring,.activity-game-dot,.activity-count,#canary-activity-popover",
    ),
  ).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("canary-visual")!),
  );
  for (const key of [
    "showActivityDock",
    "showGameActivity",
    "showDownloadProgress",
    "showActivityNames",
  ])
    expect(saved).not.toHaveProperty(key);
  expect(saved).toMatchObject({
    font: "Monocraft",
    fontScale: 120,
    minecraft: "full",
    sidebarSide: "right",
    sidebarMode: "floating",
    materialStyle: "liquid",
    app: "sakura1",
    showCommunity: false,
  });
  await nav(page, "Settings").click();
  await expect(
    page
      .locator(".settings-nav")
      .getByRole("button", { name: "Activity", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search settings" })
    .fill("activity dock");
  await expect(page.locator(".settings-results button")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav(page, "Downloads").click();
  await emitTask(page);
  await expect(page.locator(".activity-active")).toContainText("43 / 97");
  await expect(page.locator(".activity-active progress")).toHaveAttribute(
    "value",
    "67",
  );
});
test("failed first install leaves no ghost; successful retry publishes only after completion", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Library").click();
  await page.getByRole("button", { name: "New instance", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Failed first install");
  await dialog
    .getByRole("button", { name: "New instance", exact: true })
    .click();
  await expect(dialog.locator(".activity-task")).toBeVisible();
  await expect(page.locator(".instance-card")).toHaveCount(9);
  await page.evaluate(() => (globalThis as any).__materialQA.failCreate());
  await expect(dialog.locator(".activity-task")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".instance-card")).toHaveCount(9);
  await nav(page, "Downloads").click();
  await expect(page.locator(".activity-active .activity-task")).toHaveCount(0);
  await page.locator(".activity-recent summary").click();
  await expect(page.locator(".activity-recent")).toContainText(
    "Failed first install",
  );
  await expect(
    page.locator(".activity-recent progress,.activity-recent .activity-file"),
  ).toHaveCount(0);
  await nav(page, "Library").click();
  await page.getByRole("button", { name: "New instance", exact: true }).click();
  await dialog.locator("input").first().fill("Successful retry");
  await dialog
    .getByRole("button", { name: "New instance", exact: true })
    .click();
  await expect(dialog.locator(".activity-task")).toBeVisible();
  await expect(page.locator(".instance-card")).toHaveCount(9);
  await page.evaluate(() => (globalThis as any).__materialQA.completeCreate());
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".instance-card")).toHaveCount(10);
  await expect(
    page.locator(".instance-card").filter({ hasText: "Successful retry" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".instance-card").filter({ hasText: "Canary world 2" }),
  ).toHaveCount(1);
});
test("Downloads progress remains readable in all materials and themes without a sidebar Dock", async ({
  page,
}) => {
  test.setTimeout(240000);
  await setup(page);
  await page.setViewportSize({ width: 760, height: 540 });
  mkdirSync(".qa/dock-removal", { recursive: true });
  for (const theme of ["light", "dark", "amoled", "system"])
    for (const material of [
      "solid",
      "soft",
      "vibrancy",
      "glass",
      "liquid",
      "transparent",
    ]) {
      await page.evaluate(
        ({ theme, material }) => {
          localStorage.setItem("canary-mode", theme);
          const p = JSON.parse(localStorage.getItem("canary-visual")!);
          localStorage.setItem(
            "canary-visual",
            JSON.stringify({
              ...p,
              font: "Monocraft",
              fontScale: 120,
              minecraft: "full",
              materialStyle: material,
              materialLinked: true,
              sidebarSide: "right",
              sidebarMode: "floating",
            }),
          );
        },
        { theme, material },
      );
      await page.reload();
      await nav(page, "Downloads").click();
      await emitTask(page);
      const row = page.locator(".activity-active .activity-task");
      await expect(row).toContainText("43 / 97");
      await expect(
        row.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeVisible();
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".sidebar-bottom > button")).toHaveCount(2);
      await expect(
        page.locator(".activity-dock,.activity-popover,.activity-ring"),
      ).toHaveCount(0);
      if (material === "liquid")
        await page.screenshot({
          path: ".qa/dock-removal/" + theme + "-downloads.png",
        });
    }
});
test("short viewport and reduced motion retain Cancel and both sidebar utilities", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("canary-language", "ru");
    localStorage.setItem(
      "canary-visual",
      JSON.stringify({
        font: "Monocraft",
        minecraft: "full",
        fontScale: 120,
        sidebarSide: "right",
        sidebarMode: "floating",
      }),
    );
  });
  await setup(page);
  await page.setViewportSize({ width: 760, height: 280 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav(page, "Загрузки").click();
  const task = await emitTask(page, { total: 0, bytesTotal: 0 });
  const active = page.locator(".activity-active");
  expect(
    await active
      .locator("progress")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await active.getByRole("button", { name: "Отменить", exact: true }).focus();
  await finish(page, task, "cancelled");
  await expect(active.locator(".activity-task")).toHaveCount(0);
  await expect(page.locator(".sidebar-bottom > button")).toHaveCount(2);
  await page.locator(".sidebar-bottom > button").first().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".sidebar-bottom > button").last()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".settings-modal")).toBeVisible();
});

