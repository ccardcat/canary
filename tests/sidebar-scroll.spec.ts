import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { nativeFixture } from "./helpers/nativeFixture";

// Playwright hides painted scrollbars by default, preventing real thumb dragging.
test.use({
  launchOptions: {
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

test.beforeEach(() => mkdirSync(".qa/sidebar-scroll", { recursive: true }));

async function start(page: Page, russian = false) {
  await nativeFixture(page);
  await page.addInitScript((ru) => {
    if (!localStorage.getItem("canary-language"))
      localStorage.setItem("canary-language", ru ? "ru" : "en");
    if (!localStorage.getItem("canary-visual"))
      localStorage.setItem(
        "canary-visual",
        JSON.stringify({
          font: "Monocraft",
          minecraft: "full",
          fontScale: 120,
          app: "sakura1",
          cursor: "system",
          ambient: "off",
          sidebarMode: "attached",
          materialStyle: "liquid",
          materialLinked: true,
        }),
      );
  }, russian);
  await page.goto("/");
  await expect(page.locator(".home-greeting")).toBeVisible();
  await expect(page.locator(".startup-splash")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function choose(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function contained(page: Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const aside = element.closest(".sidebar")!.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      height: rect.height,
      width: rect.width,
      asideTop: aside.top,
      asideBottom: aside.bottom,
      asideLeft: aside.left,
      asideRight: aside.right,
      viewport: innerHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.asideTop);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.asideBottom + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.asideLeft);
  expect(geometry.right).toBeLessThanOrEqual(geometry.asideRight + 1);
  expect(geometry.height).toBeGreaterThanOrEqual(42);
  expect(geometry.width).toBeGreaterThanOrEqual(40);
}

test("sidebar controls remain reachable at minimum height, scale equivalents and extreme fallback", async ({
  page,
}) => {
  test.setTimeout(120000);
  await start(page, true);
  for (const viewport of [
    { width: 1280, height: 540 },
    { width: 760, height: 540 },
    { width: 1024, height: 432 },
    { width: 853, height: 360 },
    { width: 760, height: 280 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    for (const side of ["left", "right"])
      for (const mode of ["attached", "floating"]) {
        // Test CSS geometry independently of the existing settings binding tests.
        await page.evaluate(
          ({ side, mode }) => {
            document.documentElement.dataset.sidebarSide = side;
            document.documentElement.dataset.sidebarMode = mode;
          },
          { side, mode },
        );
        for (const compact of [true, false]) {
          if (
            (await page
              .locator(".sidebar")
              .evaluate((el) => el.classList.contains("compact"))) !== compact
          )
            await page.locator(".sidebar-bottom button").first().click();
          await expect(page.locator(".sidebar")).toHaveClass(
            compact ? /compact/ : /^sidebar$/,
          );
          await expect
            .poll(() =>
              page
                .locator(".sidebar")
                .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
            )
            .toBe(compact ? 76 : 224);
          for (const button of await page
            .locator(".sidebar nav button")
            .all()) {
            // Native focus() must reveal hidden items in the appropriate scroller.
            await button.focus();
            const visible = await button.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const parent = (
                innerHeight <= 340
                  ? el.closest(".sidebar-content")
                  : el.closest("nav")
              )!.getBoundingClientRect();
              return {
                visible:
                  rect.top >= parent.top - 1 &&
                  rect.bottom <= parent.bottom + 1,
                button: el.getAttribute("aria-label"),
                top: rect.top,
                bottom: rect.bottom,
                parentTop: parent.top,
                parentBottom: parent.bottom,
              };
            });
            expect(
              visible.visible,
              `${viewport.width}×${viewport.height}, ${side}, ${mode}, compact=${compact}: ${JSON.stringify(visible)}`,
            ).toBe(true);
          }
          for (let index = 0; index < 2; index++) {
            await page.locator(".sidebar-bottom button").nth(index).focus();
            await contained(
              page,
              `.sidebar-bottom button:nth-child(${index + 1})`,
            );
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollHeight <= innerHeight + 1,
            ),
          ).toBe(true);
          const bounds = await page.locator(".sidebar").boundingBox();
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
            viewport.height,
          );
          await expect(page.locator(".sidebar-content")).toHaveCSS(
            "overflow-y",
            viewport.height <= 340 ? "auto" : "visible",
          );
          await expect(page.locator(".sidebar nav")).toHaveCSS(
            "overflow-y",
            viewport.height <= 340 ? "visible" : "auto",
          );
        }
      }
    await page.mouse.move(500, 50);
    await page.screenshot({
      path: `.qa/sidebar-scroll/ru-${viewport.width}x${viewport.height}.png`,
    });
  }
});

test("wheel, scrollbar drag and Tab reveal navigation while utilities stay pinned", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await start(page);
  const nav = page.locator(".sidebar nav");
  const utility = page.locator(".sidebar-bottom");
  const bottomBefore = await utility.boundingBox();
  const rect = (await nav.boundingBox())!;
  const dimensions = await nav.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    width: el.offsetWidth - el.clientWidth,
  }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  expect(dimensions.width).toBe(8);
  await page.mouse.move(rect.x + 20, rect.y + 20);
  await page.mouse.wheel(0, 90);
  await expect
    .poll(() => nav.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await nav.evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(200);
  await nav.evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: ".qa/sidebar-scroll/drag-before.png" });
  const thumb = Math.max(24, dimensions.client ** 2 / dimensions.scroll);
  await page.mouse.move(rect.x + rect.width - 4, rect.y + thumb / 2);
  const widthBefore = rect.width;
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width - 4,
    rect.y + dimensions.client - thumb / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.screenshot({ path: ".qa/sidebar-scroll/drag-after.png" });
  await expect
    .poll(() => nav.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect((await nav.boundingBox())!.width).toBe(widthBefore);
  expect((await utility.boundingBox())!.y).toBe(bottomBefore!.y);
  await page.screenshot({ path: ".qa/sidebar-scroll/drag-bottom.png" });
  await nav.evaluate((el) => (el.scrollTop = 0));
  await nav.locator("button").first().focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  await expect(nav.locator("button").last()).toBeFocused();
  expect(await nav.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(nav.locator("button").last()).toHaveCSS("outline-style", "solid");
  expect(
    await nav
      .locator("button")
      .last()
      .evaluate((el) => getComputedStyle(el).boxShadow),
  ).toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.locator(".sidebar-bottom button").first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Language", exact: true }).first(),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".settings-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-modal")).toHaveCount(0);
});

test("small-window mode and language controls work and persist including explicit narrow expansion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await start(page);
  await expect(page.locator(".sidebar")).toHaveClass(/compact/);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/compact/);
  await page.reload();
  await expect(page.locator(".sidebar")).not.toHaveClass(/compact/);
  for (const language of ["Русский", "English", "Русский"]) {
    await page.locator(".sidebar-bottom button").last().click();
    await page
      .getByRole("button", {
        name: new RegExp(language + " (интерфейс|interface)"),
      })
      .click();
    await page.keyboard.press("Escape");
    await contained(page, ".sidebar-bottom button:last-child");
  }
  await expect(page.locator(".sidebar-bottom button").last()).toHaveAttribute(
    "aria-label",
    "Язык",
  );
  await page.reload();
  await expect(page.locator(".sidebar-bottom button").last()).toHaveAttribute(
    "aria-label",
    "Язык",
  );
  await page
    .getByRole("button", { name: "Свернуть панель", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveClass(/compact/);
  await page
    .getByRole("button", { name: "Развернуть панель", exact: true })
    .click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/compact/);
  await page
    .getByRole("button", { name: "Свернуть панель", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".sidebar")).toHaveClass(/compact/);
});

test("arrow-free scrollbar styles inherit across pages, dialogs, themes and materials", async ({
  page,
}) => {
  test.setTimeout(90000);
  await start(page);
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.locator(".instance-card").first().waitFor();
  const check = async (selector: string) => {
    const style = await page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const css = (pseudo: string) => getComputedStyle(el, pseudo);
        return {
          button: css("::-webkit-scrollbar-button").display,
          buttonHeight: css("::-webkit-scrollbar-button").height,
          buttonWidth: css("::-webkit-scrollbar-button").width,
          track: css("::-webkit-scrollbar-track").backgroundColor,
          corner: css("::-webkit-scrollbar-corner").backgroundColor,
          radius: css("::-webkit-scrollbar-thumb").borderRadius,
          thumb: css("::-webkit-scrollbar-thumb").backgroundColor,
          filter: css("::-webkit-scrollbar-thumb").backdropFilter,
          width: getComputedStyle(el).scrollbarWidth,
          tokens: ["--scrollbar-thumb-hover", "--scrollbar-thumb-active"].map(
            (key) => getComputedStyle(el).getPropertyValue(key),
          ),
        };
      });
    expect(style.button).toBe("none");
    expect(style.buttonHeight).toBe("0px");
    expect(style.buttonWidth).toBe("0px");
    expect(style.track).toBe("rgba(0, 0, 0, 0)");
    expect(style.corner).toBe("rgba(0, 0, 0, 0)");
    expect(style.radius).toBe("999px");
    expect(style.width).toBe("auto");
    expect(style.thumb).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.filter).toBe("none");
    expect(style.tokens[0]).not.toBe(style.tokens[1]);
    return style.thumb;
  };
  await check(".content-shell");
  await check(".sidebar nav");
  await page
    .locator(".instance-card")
    .first()
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await check(".instance-surface-body");
  await page.keyboard.press("Escape");
  await page.route("https://api.modrinth.com/v2/**", (route) => {
    const project = {
      project_id: "scroll-qa",
      slug: "scroll-qa",
      title: "Scrollbar QA",
      description: "A project with a long description",
      project_type: "modpack",
      downloads: 100,
      icon_url: "http://127.0.0.1:1420/branding/canary-bird-white.png",
      categories: ["adventure"],
      versions: ["1.21.1"],
    };
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search"))
      return route.fulfill({ json: { hits: [project], total_hits: 1 } });
    if (url.pathname.endsWith("/version")) return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        ...project,
        id: "scroll-qa",
        followers: 1,
        updated: "2026-10-06",
        game_versions: ["1.21.1"],
        gallery: [],
        body: Array.from(
          { length: 60 },
          () => "Paragraph for scrolling verification.",
        ).join("\n\n"),
      },
    });
  });
  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  // The initial query already returned an empty fixture; search requests new data.
  await page.locator(".discover-page .search-field input").fill("scrollbar");
  await page.locator(".discover-page .card-title").first().waitFor();
  await check(".content-shell");
  await page.locator(".discover-page .card-title").first().click();
  await page.locator(".detail-side").waitFor();
  await check(".content-shell");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  const colors = [];
  for (const theme of ["Light", "Dark", "AMOLED", "System"]) {
    await page
      .locator(".mode-grid")
      .getByRole("button", { name: theme, exact: true })
      .click();
    colors.push(await check(".settings-content"));
    await check(".settings-nav");
    await page
      .locator(".settings-content")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.mouse.move(1200, 40);
    await page.screenshot({
      path: `.qa/sidebar-scroll/settings-${theme.toLowerCase()}.png`,
    });
  }
  expect(colors[0]).not.toBe(colors[1]);
  for (const material of [
    "Solid",
    "Soft",
    "Vibrancy",
    "Glass",
    "Liquid Glass",
    "Transparent",
  ]) {
    await choose(page, "Shared material", material);
    await check(".settings-content");
    await check(".sidebar nav");
  }
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await check(".settings-content");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await check(".settings-content");
});

test("small-height sidebar side and surface settings switch without losing utility access", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1024, height: 432 });
  await start(page);
  for (const side of ["Right", "Left"])
    for (const mode of ["Floating", "Attached", "Floating"]) {
      await page.locator(".sidebar nav button").last().click();
      await page.getByRole("button", { name: side, exact: true }).click();
      await choose(page, "Sidebar layout", mode);
      await page.keyboard.press("Escape");
      await expect(page.locator("html")).toHaveAttribute(
        "data-sidebar-side",
        side.toLowerCase(),
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-sidebar-mode",
        mode.toLowerCase(),
      );
      await contained(page, ".sidebar-bottom button:first-child");
      await contained(page, ".sidebar-bottom button:last-child");
    }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-side",
    "left",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-mode",
    "floating",
  );
  await contained(page, ".sidebar-bottom button:last-child");
});
