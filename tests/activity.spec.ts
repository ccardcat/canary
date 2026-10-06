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
  await expect(page.locator(".activity-dock")).toBeVisible();
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
test("hover delay, pointer grace, keyboard and outside click", async ({
  page,
}) => {
  await setup(page);
  const dock = page.locator(".activity-dock"),
    panel = page.locator(".activity-popover");
  await dock.hover();
  await expect(panel).toHaveCount(0, { timeout: 100 });
  await expect(panel).toBeVisible();
  await panel.hover();
  await page.waitForTimeout(300);
  await expect(panel).toBeVisible();
  await page.mouse.move(650, 120);
  await expect(panel).toHaveCount(0);
  await dock.focus();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(dock).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await page.locator(".brand").click();
  await expect(panel).toHaveCount(0);
  await dock.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
});
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
  await expect(page.locator(".activity-ring")).toHaveCount(0);
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
  await expect(page.locator(".activity-ring")).toHaveCount(0);
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
test("finalize disables cancellation; multiple activities include the running game", async ({
  page,
}) => {
  await setup(page);
  await emitTask(page);
  await emitTask(page, {
    operationId: "second",
    title: "Second pack",
    kind: "update",
    cancellable: false,
    stage: "finalize",
  });
  await page.locator(".activity-dock").click();
  const panel = page.locator(".activity-popover");
  await expect(panel.locator(".activity-task")).toHaveCount(3);
  await expect(panel).toContainText("Game running");
  await expect(
    panel.getByRole("button", { name: "Finishing…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".activity-count")).toHaveText("3");
});
test("Launching only becomes Playing after process-backed snapshot and clears on exit", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const qa = (globalThis as any).__materialQA;
    qa.state.instances.forEach((i: any) => (i.status = "ready"));
    const { emit } = await import(
      "/node_modules/@tauri-apps/api/event.js" as string
    );
    await emit("instances-changed", {});
  });
  const task = await emitTask(page, {
    kind: "launch",
    operationId: "instance-0",
    instanceId: "instance-0",
    title: "Fabulously Optimized",
    total: 0,
    bytesTotal: 0,
    currentFile: "",
  });
  await expect(page.locator(".activity-dock")).toContainText(
    "Launching Minecraft",
  );
  await page.locator(".activity-dock").click();
  await expect(page.locator(".activity-popover .playing")).toHaveCount(0);
  await page.evaluate(async () => {
    const qa = (globalThis as any).__materialQA;
    qa.state.instances[0].status = "running";
    qa.state.instances[0].last_played = Math.floor(Date.now() / 1000) - 1440;
    const { emit } = await import(
      "/node_modules/@tauri-apps/api/event.js" as string
    );
    await emit("instances-changed", {});
  });
  await finish(page, task, "completed");
  await expect(page.locator(".activity-popover .playing")).toContainText(
    "24 min",
  );
  await expect(page.locator(".activity-popover .playing")).toContainText(
    "Minecraft 1.21.1",
  );
  await page
    .locator(".activity-popover")
    .getByRole("button", { name: "Stop game", exact: true })
    .click();
  await expect(page.locator(".activity-popover .playing")).toHaveCount(0);
  await page.evaluate(async () => {
    const { emit } = await import(
      "/node_modules/@tauri-apps/api/event.js" as string
    );
    await emit("process-exited", { id: "instance-0", status: "ready" });
  });
  await expect(page.locator(".activity-dock.playing")).toHaveCount(0);
});
test("Activity settings persist, names are private, hidden dock does not stop tasks", async ({
  page,
}) => {
  await setup(page);
  const task = await emitTask(page);
  await nav(page, "Settings").click();
  await page
    .locator(".settings-nav")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  const settings = page.locator(".activity-settings");
  await settings.getByRole("switch", { name: "Show instance names" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-modal")).toHaveCount(0);
  await page.locator(".activity-dock").click();
  await expect(page.locator(".activity-popover")).not.toContainText(task.title);
  await expect(page.locator(".activity-popover")).not.toContainText(
    "Canary world",
  );
  await page.keyboard.press("Escape");
  await nav(page, "Settings").click();
  await page
    .locator(".settings-nav")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await settings.getByRole("switch", { name: "Show activity dock" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".activity-dock")).toHaveCount(0);
  await nav(page, "Downloads").click();
  await expect(page.locator(".activity-active .activity-task")).toHaveCount(1);
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("canary-visual")!).showActivityNames,
    ),
  ).toBe(false);
  await expect(page.locator(".activity-dock")).toHaveCount(0);
});
test("popover mirrors and clamps; bottom utilities fit small windows in all materials and themes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  mkdirSync(".qa/activity", { recursive: true });
  for (const side of ["left", "right"])
    for (const mode of ["attached", "floating"])
      for (const compact of [false, true]) {
        await page.evaluate(
          ({ side, mode, compact }) => {
            const p = JSON.parse(localStorage.getItem("canary-visual") || "{}");
            localStorage.setItem(
              "canary-visual",
              JSON.stringify({
                ...p,
                sidebarSide: side,
                sidebarMode: mode,
                font: "Monocraft",
                minecraft: "full",
                fontScale: 120,
              }),
            );
            localStorage.setItem("canary-compact", String(compact));
            localStorage.setItem(
              "canary-sidebar-expanded-narrow",
              String(!compact),
            );
          },
          { side, mode, compact },
        );
        await page.setViewportSize({ width: 760, height: 540 });
        await page.reload();
        await page.locator(".activity-dock").click();
        const bounds = await page.locator(".activity-popover").boundingBox(),
          dock = await page.locator(".activity-dock").boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(36);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(760);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(540);
        if (side === "left")
          expect(bounds!.x).toBeGreaterThan(dock!.x + dock!.width);
        else expect(bounds!.x + bounds!.width).toBeLessThan(dock!.x);
        await page.keyboard.press("Escape");
        const buttons = await page
          .locator(".sidebar-bottom>button")
          .evaluateAll((items) =>
            items.map((e) => {
              const r = e.getBoundingClientRect();
              return { bottom: r.bottom, height: r.height };
            }),
          );
        expect(buttons).toHaveLength(3);
        buttons.forEach((r) => {
          expect(r.bottom).toBeLessThanOrEqual(540);
          expect(r.height).toBeGreaterThanOrEqual(42);
        });
      }
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
              materialLinked: true,
              materialStyle: material,
            }),
          );
        },
        { theme, material },
      );
      await page.reload();
      await emitTask(page);
      await page.locator(".activity-dock").click();
      await expect(page.locator(".activity-popover")).toBeVisible();
      const materialState = await page
        .locator(".activity-popover")
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            fill: s.getPropertyValue("--mat-popovers-fill"),
            background: s.backgroundImage,
            width: el.getBoundingClientRect().width,
            scroll: el.scrollWidth,
          };
        });
      expect(materialState.fill).toBeTruthy();
      expect(materialState.background).not.toBe("none");
      expect(materialState.scroll).toBeLessThanOrEqual(
        Math.ceil(materialState.width),
      );
      if (material === "liquid")
        await page.screenshot({
          path: ".qa/activity/" + theme + "-liquid.png",
        });
      await page.keyboard.press("Escape");
    }
});
test("short viewport, large typography and reduced motion retain keyboard access", async ({
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
  const task = await emitTask(page, { total: 0, bytesTotal: 0 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".activity-dock").focus();
  const panel = page.locator(".activity-popover");
  await expect(panel).toBeVisible();
  expect(
    await panel
      .locator("progress")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await panel.getByRole("button", { name: "Отменить", exact: true }).focus();
  const rect = await panel.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(36);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(280);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await finish(page, task, "cancelled");
  await page.locator(".sidebar-bottom>button").last().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".settings-modal")).toBeVisible();
});
