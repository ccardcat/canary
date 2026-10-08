import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { nativeFixture } from "./helpers/nativeFixture";
import { timeOfDay } from "../src/components/HomeGreeting";

test.use({ timezoneId: "Europe/Moscow" });
test.beforeEach(() => mkdirSync(".qa/home-polish", { recursive: true }));
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
}
async function choose(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function refresh(page: Page) {
  await page.evaluate(async () => {
    const { emit } = await import("/node_modules/@tauri-apps/api/event.js");
    await emit("instances-changed");
  });
}
async function catalog(page: Page) {
  await page.route("https://api.modrinth.com/v2/**", (route) => {
    const url = new URL(route.request().url());
    const project = {
      project_id: "better-qa",
      slug: "better-qa",
      title: "Better MC",
      description: "Community worlds, exploration and optimization",
      project_type: "modpack",
      downloads: 1000,
      icon_url: route.request().url().startsWith("http")
        ? "http://127.0.0.1:1420/branding/canary-bird-white.png"
        : undefined,
      categories: ["adventure", "combat", "optimization"],
      versions: ["1.20.1"],
    };
    if (url.pathname.endsWith("/search"))
      return route.fulfill({ json: { hits: [project], total_hits: 1 } });
    if (url.pathname.endsWith("/version"))
      return route.fulfill({
        json: Array.from({ length: 8 }, (_, i) => ({
          id: "v" + i,
          name: "Version " + i,
          version_number: "1." + i,
          game_versions: ["1.20.1"],
          loaders: ["fabric"],
          files: [{ filename: "better.mrpack", primary: true }],
          date_published: "2026-07-15",
          changelog: "Release notes",
        })),
      });
    return route.fulfill({
      json: {
        ...project,
        id: "better-qa",
        followers: 100,
        updated: "2026-07-15",
        game_versions: ["1.20.1", "1.21.1"],
        gallery: [
          {
            url: "http://127.0.0.1:1420/backgrounds/sakura1-bg.jpg",
            title: "World",
          },
        ],
        body: "## Explore your next world\nDescription with [a link](https://example.test) and normal text.",
      },
    });
  });
}
test("time periods have complete boundaries including midnight", () => {
  const expected = [
    "night",
    "night",
    "night",
    "night",
    "night",
    "morning",
    "morning",
    "morning",
    "morning",
    "morning",
    "morning",
    "morning",
    "day",
    "day",
    "day",
    "day",
    "day",
    "day",
    "evening",
    "evening",
    "evening",
    "evening",
    "evening",
    "night",
  ];
  for (let hour = 0; hour < 24; hour++)
    expect(timeOfDay(hour)).toBe(expected[hour]);
});

test("local-time greeting changes live, switches account and handles no account or long display name", async ({
  page,
}) => {
  test.setTimeout(90000);
  await nativeFixture(page);
  await page.clock.install({ time: new Date("2026-10-06T03:00:00Z") });
  await page.addInitScript(() => {
    if (!localStorage.getItem("canary-language"))
      localStorage.setItem("canary-language", "ru");
  });
  await page.goto("/");
  const heading = page.locator(".home-greeting");
  await expect(heading).toContainText("Доброе утро, LicensedPlayer");
  for (const [utc, period, text] of [
    ["09:00", "day", "Добрый день"],
    ["10:00", "day", "Добрый день"],
    ["15:00", "evening", "Добрый вечер"],
    ["17:00", "evening", "Добрый вечер"],
    ["20:30", "night", "Доброй ночи"],
    ["23:00", "night", "Доброй ночи"],
    ["22:00", "night", "Доброй ночи"],
    ["02:00", "morning", "Доброе утро"],
  ]) {
    await page.clock.setSystemTime(new Date(`2026-10-06T${utc}:00Z`));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(heading).toHaveAttribute("data-period", period);
    await expect(heading).toContainText(text);
    await expect(heading.locator(".greeting-icon")).toHaveClass(
      new RegExp(period === "morning" || period === "day" ? "sun" : "moon"),
    );
  }
  await page.locator(".account-button").click();
  await page.locator(".runtime-account .popover-action").first().click();
  await expect(heading).toContainText("CanaryPlayer");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const state = (globalThis as any).__materialQA.state;
    state.accounts[0].display_name =
      "A very long Minecraft player display name that wraps safely";
  });
  await refresh(page);
  await expect(heading).toContainText("very long Minecraft");
  await page.setViewportSize({ width: 760, height: 540 });
  expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.evaluate(() => {
    (globalThis as any).__materialQA.state.accounts = [];
  });
  await refresh(page);
  await expect(heading).toHaveText("Доброе утро");
  await page.evaluate(() => localStorage.setItem("canary-language", "en"));
  await page.reload();
  await expect(heading).toContainText("Good morning");
});

test("Home hero copy stays stable through slides and Continue has compact real Play/Stop and details", async ({
  page,
}) => {
  mkdirSync(".qa/home-polish", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await nativeFixture(page);
  await page.goto("/");
  await expect(page.locator(".hero-content .overline")).toHaveCount(0);
  const title = await page.locator(".hero-content h2").textContent();
  await page
    .getByRole("button", { name: "Next background", exact: true })
    .click();
  await expect(page.locator(".hero-content h2")).toHaveText(title!);
  const card = page.locator(".continuation-card").first();
  expect((await card.boundingBox())!.height).toBeLessThan(110);
  await expect(card.locator(".continue-open")).toContainText(
    "Minecraft 1.21.1 · fabric",
  );
  await card.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.locator(".content-shell").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: ".qa/home-polish/home.png" });
  expect(errors).toEqual([]);
  await card.locator(".material-icon").click();
  await expect(page.locator(".instance-surface")).toContainText(
    "Fabulously Optimized",
  );
});

test("community visibility is searchable, applies live, persists and preserves appearance", async ({
  page,
}) => {
  await nativeFixture(page);
  await catalog(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("canary-visual"))
      localStorage.setItem(
        "canary-visual",
        JSON.stringify({
          font: "Monocraft",
          minecraft: "full",
          app: "sakura1",
          cursor: "system",
          materialLinked: true,
          materialStyle: "liquid",
          showCommunity: "invalid",
        }),
      );
  });
  await page.goto("/");
  await expect(page.locator(".community-section")).toBeVisible();
  await settings(page);
  const search = page.getByRole("searchbox", {
    name: "Search settings",
    exact: true,
  });
  for (const word of ["community", "popular", "популярно", "сообщество"]) {
    await search.fill(word);
    await expect(page.locator(".settings-results")).toContainText("Appearance");
  }
  await page.locator(".settings-results button").click();
  const toggle = page.getByRole("switch", {
    name: "Show popular community projects",
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator(".community-section")).toHaveCount(0);
  await expect(page.locator(".home-page>.home-section")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".community-section")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("canary-visual")!),
    ),
  ).toMatchObject({
    font: "Monocraft",
    app: "sakura1",
    cursor: "system",
    materialStyle: "liquid",
    showCommunity: false,
  });
  await settings(page);
  await page
    .getByRole("switch", {
      name: "Show popular community projects",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".community-section")).toBeVisible();
});

test("RU Monocraft particle labels have a real gap and regrouped settings retain controls", async ({
  page,
}) => {
  await nativeFixture(page);
  await page.addInitScript(() => {
    localStorage.setItem("canary-language", "ru");
    localStorage.setItem(
      "canary-visual",
      JSON.stringify({
        font: "Monocraft",
        minecraft: "full",
        effectPreset: "custom",
      }),
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Настройки", exact: true })
    .first()
    .click();
  const headings = await page.locator(".settings-content h3").allTextContents();
  expect(headings).toEqual(
    expect.arrayContaining(["Материалы", "Фон", "Эффекты", "Типографика"]),
  );
  const preset = page.getByRole("combobox", {
    name: "Пресет частиц",
    exact: true,
  });
  await expect(preset).toContainText("Свой");
  const gap = await preset.evaluate((el) => {
    const label = el.closest("label")!;
    const range = document.createRange();
    range.selectNode(label.childNodes[0]);
    return (
      el.getBoundingClientRect().top - range.getBoundingClientRect().bottom
    );
  });
  expect(gap).toBeGreaterThanOrEqual(7);
  await choose(page, "Пресет частиц", "Средний");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("canary-visual")!).effectPreset,
    ),
  ).toBe("medium");
  await preset.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".qa/home-polish/settings-particles-ru.png" });
  for (const selector of [
    '.settings-content button:not([style*="font-family"])',
    ".settings-content label",
    ".glass-select-trigger",
  ])
    expect(
      await page
        .locator(selector)
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => n.getBoundingClientRect().height > 0)
            .every((n) => getComputedStyle(n).fontFamily.includes("Monocraft")),
        ),
    ).toBe(true);
});

test("Discover uses one search surface, separate categories, consistent provider and soft focus", async ({
  page,
}) => {
  await nativeFixture(page);
  await catalog(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  const input = page.getByRole("textbox", {
    name: "Search projects",
    exact: true,
  });
  await input.fill("World");
  await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(input).toHaveCSS("border-top-width", "0px");
  await expect(input).toHaveCSS("box-shadow", "none");
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(page.locator(".search-field")).not.toHaveCSS(
    "box-shadow",
    "none",
  );
  await expect(page.locator(".type-tabs")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".type-tabs")).toHaveCSS("gap", "8px");
  await expect(page.locator(".provider-dot")).toHaveCount(0);
  for (const tab of await page.locator(".type-tabs button").all()) {
    const before = await tab.boundingBox();
    await tab.hover();
    const after = await tab.boundingBox();
    expect(after?.width).toBe(before?.width);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveCSS("outline-style", "none");
  }
  await page.getByRole("tab", { name: "Modpacks", exact: true }).click();
  await choose(page, "Provider", "CurseForge · unavailable");
  await expect(
    page.getByRole("combobox", { name: "Provider", exact: true }),
  ).toContainText("CurseForge");
  await choose(page, "Provider", "Modrinth");
  await page.setViewportSize({ width: 760, height: 540 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".qa/home-polish/discover-small.png" });
});

test("Project details lighten Back/tabs and widen metadata with themes and every material", async ({
  page,
}) => {
  test.setTimeout(120000);
  await nativeFixture(page);
  await catalog(page);
  await page.goto("/");
  await page.locator(".home-community .card-title").first().click();
  await expect(page.locator(".detail-side")).toBeVisible();
  expect(
    (await page.locator(".detail-side").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(280);
  await expect(page.locator(".detail-categories dd span")).toHaveCount(3);
  await expect(page.locator(".back-button")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  for (const tab of await page.locator(".detail-tabs button").all()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveCSS("outline-style", "none");
  }
  for (const style of [
    "Solid",
    "Soft",
    "Vibrancy",
    "Glass",
    "Clear Glass",
    "Liquid Glass",
    "Transparent",
  ]) {
    await settings(page);
    await choose(page, "Material preset", "Liquid Glass");
    await choose(page, "Shared material", style);
    await page.keyboard.press("Escape");
    const filter = await page
      .locator(".detail-side")
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(["Solid","Transparent"].includes(style) ? filter === "none" : filter !== "none").toBe(
      true,
    );
    await expect(page.locator(".detail-tabs")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  await settings(page);
  await choose(page, "Material preset", "Liquid Glass");
  await page.keyboard.press("Escape");
  for (const theme of ["Light", "Dark", "AMOLED"]) {
    await settings(page);
    await page
      .locator(".mode-grid")
      .getByRole("button", { name: theme, exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .locator(".detail-tabs")
      .getByRole("tab", { name: "Overview", exact: true })
      .click();
    await page.screenshot({
      path: `.qa/home-polish/detail-${theme.toLowerCase()}.png`,
    });
  }
  await page.setViewportSize({ width: 760, height: 540 });
  expect(
    await page
      .locator(".detail-side")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.locator(".back-button").click();
  await expect(page.locator(".home-hero")).toBeVisible();
});

test("sidebar hover/focus matches full hit area on both sides and layouts without movement", async ({
  page,
}) => {
  test.setTimeout(90000);
  await nativeFixture(page);
  await page.goto("/");
  for (const side of ["left", "right"])
    for (const layout of ["attached", "floating"]) {
      await page.evaluate(
        ({ side, layout }) => {
          const value = JSON.parse(localStorage.getItem("canary-visual")!);
          localStorage.setItem(
            "canary-visual",
            JSON.stringify({
              ...value,
              sidebarSide: side,
              sidebarMode: layout,
              materialLinked: true,
              materialStyle: "liquid",
            }),
          );
        },
        { side, layout },
      );
      await page.reload();
      for (let compact = 0; compact < 2; compact++) {
        await expect
          .poll(() =>
            page
              .locator(".sidebar")
              .evaluate((el) => el.getBoundingClientRect().width),
          )
          .toBe(compact ? 76 : 224);
        const home = page.locator(".sidebar nav button").first();
        const before = await home.boundingBox();
        await home.hover();
        const after = await home.boundingBox();
        expect(after).toEqual(before);
        await expect(home).toHaveCSS("outline-style", "none");
        await home.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await expect(home).toBeFocused();
        await expect(home).toHaveCSS("outline-style", "none");
        expect(
          await home.evaluate((el) => getComputedStyle(el).boxShadow),
        ).toContain("inset");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.locator(".sidebar-bottom button").first().click();
      }
    }
});

test("long Home names and empty Continue remain readable at desktop scale equivalents", async ({
  page,
}) => {
  test.setTimeout(90000);
  await nativeFixture(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("canary-language"))
      localStorage.setItem("canary-language", "ru");
  });
  await page.goto("/");
  await page.evaluate(() => {
    const state = (globalThis as any).__materialQA.state;
    state.accounts.at(-1).username = "Long_Player_Name_Without_Undefined";
    state.instances[0].name =
      "Очень длинное название Minecraft сборки для большого нового мира";
  });
  await refresh(page);
  for (const font of ["Nunito", "Monocraft"]) {
    await page
      .getByRole("button", { name: "Настройки", exact: true })
      .first()
      .click();
    await page
      .locator(".font-options")
      .getByRole("button", { name: font, exact: true })
      .click();
    if (font === "Monocraft")
      await page
        .getByRole("button", { name: "Весь интерфейс", exact: true })
        .click();
    await page.keyboard.press("Escape");
    for (const scale of [1, 1.25, 1.5]) {
      await page.setViewportSize({
        width: Math.round(1280 / scale),
        height: Math.round(800 / scale),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const overflow = await page.locator(".content-shell").evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        nodes: Array.from(el.querySelectorAll("*"))
          .filter(
            (n) =>
              n.getBoundingClientRect().right >
              el.getBoundingClientRect().right + 1,
          )
          .slice(0, 8)
          .map((n) => ({
            tag: n.tagName,
            cls: n.className,
            text: n.textContent?.slice(0, 70),
            width: n.getBoundingClientRect().width,
          })),
      }));
      expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(
        overflow.width,
      );
      await expect(
        page
          .locator(".continuation-card")
          .first()
          .getByRole("button", { name: "Играть", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `.qa/home-polish/home-ru-${font}-${scale}.png`,
      });
    }
  }
  await page.evaluate(() => {
    (globalThis as any).__materialQA.state.instances = [];
  });
  await refresh(page);
  await expect(page.locator(".home-empty").first()).toContainText(
    "Пока нечего продолжать",
  );
  await expect(page.locator(".continuation-card")).toHaveCount(0);
  await expect(
    page
      .locator(".home-empty")
      .first()
      .getByRole("button", { name: "Найти сборки", exact: true }),
  ).toBeVisible();
});
