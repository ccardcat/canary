import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.modrinth.com/**", route => route.fulfill({ json: { hits: [], total_hits: 0 } }));
  await page.goto("/");
});
test("sidebar mirrors and collapses on both sides without overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const side of ["Right", "Left"]) {
    await page.getByRole("button", { name: side, exact: true }).click();
    await page.keyboard.press("Escape");
    for (const compact of [false, true]) {
      if (compact) await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      else if (await page.locator(".sidebar").evaluate(el => el.classList.contains("compact"))) await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await expect(page.locator(".sidebar")).toHaveClass(compact ? /compact/ : /^sidebar$/);
      const [sidebar, content] = await Promise.all([page.locator(".sidebar").boundingBox(),page.locator(".content-shell").boundingBox()]);
      expect(side === "Right" ? sidebar!.x > content!.x : sidebar!.x < content!.x).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const scroll = await page.locator(".content-shell").evaluate(el => {
        // Force overflow only in this test to measure the real scrollbar gutter.
        const spacer = document.createElement("div"); spacer.style.height = "2000px"; el.append(spacer);
        const gutter = el.offsetWidth - el.clientWidth;
        const result = { gutter, left: el.clientLeft, direction: getComputedStyle(el).direction,
          childrenLTR: [...el.children].every(child => getComputedStyle(child).direction === "ltr") };
        el.scrollTop = 100; const scrolled = el.scrollTop; spacer.remove();
        return { ...result, scrolled };
      });
      expect(scroll.gutter).toBeGreaterThan(0);
      expect(scroll.left).toBe(side === "Right" ? scroll.gutter : 0);
      expect(scroll.childrenLTR).toBe(true);
      expect(scroll.scrolled).toBe(100);
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar-side", "left");
});
test("custom cursors preserve editing; ordinary right click is suppressed", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const [name,id] of [["Canary Custom","custom"],["System","system"]]) {
    await page.getByRole("group", { name: "Cursor", exact: true }).getByRole("button", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-cursor",id);
    const cursor = await page.locator(".settings-top button").evaluate(el => getComputedStyle(el).cursor);
    if (id === "system") expect(cursor).toBe("pointer");
    else {
      expect(cursor).toContain("/cursors/link.cur");
      const textCursor = await page.evaluate(() => {
        const input = document.createElement("input"); document.body.append(input);
        const result = getComputedStyle(input).cursor; input.remove(); return result;
      });
      expect(textCursor).toContain("/cursors/beam.cur");
    }
  }
  await page.keyboard.press("Escape");
  const prevented = await page.locator("h1").evaluate(el => !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles:true, cancelable:true })));
  expect(prevented).toBe(true);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name:"Discover",exact:true }).first().click();
  const input = page.getByRole("textbox", { name:"Search projects" });
  await input.fill("Minecraft");
  await input.click({button:"right"});
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem",{name:"Select all"}).click();
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe(9);
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");
});
test("advanced backgrounds reset, crossfade and effect budgets persist", async ({ page }) => {
  await page.getByRole("button", { name:"Settings",exact:true }).click();
  await page.getByText("Advanced background controls",{exact:true}).click();
  const brightness = page.getByRole("slider",{name:"Brightness",exact:true});
  await brightness.focus(); await page.keyboard.press("End");
  await expect(page.locator("html")).toHaveCSS("--wallpaper-brightness","1.3");
  await page.getByRole("button",{name:"Right",exact:true}).last().click();
  await expect(page.locator("html")).toHaveCSS("--wallpaper-position","right");
  await page.locator(".polish-disclosure").first().getByRole("button",{name:"Reset"}).click();
  await expect(brightness).toHaveValue("100");
  await page.locator(".background-options").first().getByRole("button",{name:"Green"}).click();
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/green-bg.webp/);
  await page.locator(".background-options").first().getByRole("button",{name:"Gray"}).click();
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/gray-bg.png/);
  await page.getByRole("button",{name:"Snow",exact:true}).click();
  await page.getByRole("switch",{name:"Focus mode",exact:true}).click();
  await expect(page.locator(".ambient-particles")).toHaveCount(0);
  await page.locator(".settings-nav").getByRole("button",{name:"Advanced",exact:true}).click();
  await page.getByRole("button",{name:"Low",exact:true}).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-quality","low");
  await expect(page.locator("html")).toHaveAttribute("data-focus","true");
});

test("native cursor roles, hotspots and migration", async ({ page, request }) => {
  await page.evaluate(() => localStorage.setItem("canary-visual", JSON.stringify({ cursor:"mono", sidebarSide:"right" })));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-cursor", "custom");
  const roles = { help:"help", crosshair:"precision", "ew-resize":"horz", "ns-resize":"vert",
    "nwse-resize":"dgn1", "nesw-resize":"dgn2", move:"move", wait:"busy-static",
    alternate:"alternate", handwriting:"handwriting", person:"person", pin:"pin" };
  for (const [state,file] of Object.entries(roles)) {
    const cursor = await page.evaluate(state => {
      const node = document.createElement("button"); node.dataset.cursorState = state;
      document.body.append(node); const cursor = getComputedStyle(node).cursor; node.remove(); return cursor;
    }, state);
    expect(cursor).toContain(`/cursors/${file}.cur`);
  }
  for (const [attribute,file] of [["disabled","unavailable"],["aria-busy","working-static"]]) {
    const cursor = await page.evaluate(attribute => {
      const button = document.createElement("button"); button.setAttribute(attribute, "true");
      document.body.append(button); const cursor = getComputedStyle(button).cursor; button.remove(); return cursor;
    }, attribute);
    expect(cursor).toContain(`/cursors/${file}.cur`);
  }
  for (const file of ["pointer","link","beam",...Object.values(roles),"working-static","unavailable"]) {
    const response = await request.get(`/cursors/${file}.cur`); expect(response.ok()).toBe(true);
    const binary = await response.body(); expect(binary.readUInt16LE(2)).toBe(2);
    for (let i=0; i<binary.readUInt16LE(4); i++) {
      const entry = 6+i*16;
      expect(binary.readUInt16LE(entry+4)).toBeLessThan(binary[entry] || 256);
      expect(binary.readUInt16LE(entry+6)).toBeLessThan(binary[entry+1] || 256);
    }
  }
  await page.getByRole("button", { name:"Settings",exact:true }).click();
  await page.getByRole("group", { name:"Cursor",exact:true }).getByRole("button",{name:"System",exact:true}).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-cursor", "system");
});
