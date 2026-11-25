import {expect, test} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";

test("verified Ollama suggestions need a separate dependency review and install confirmation", async ({page}) => {
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.evaluate(() => {
    const qa = (globalThis as any).__materialQA;
    const inventory = {items:[],history:[],snapshots:[]};
    qa.overrides = {
      suggest_pack_mods: () => ["sodium","https://example.invalid/mod.jar","sodium","missing-mod"],
      content_project: ({project}: {project:string}) => project === "sodium" ?
        {id:"verified-sodium",slug:project,title:"Sodium",project_type:"mod"} : {},
      content_versions: () => [{id:"native-checked-version"}],
      bulk_content_preview: () => [{
        items:[{project:"verified-sodium",version:"native-checked-version",name:"Sodium",number:"1.0",kind:"mod"},
          {project:"required-dependency",version:"1",name:"Required dependency",number:"1.0",kind:"mod"}],
        optional:[],fingerprint:"confirmed-plan",
      }],
      install_content: () => inventory,
    };
  });
  await page.getByRole("button",{name:"Library",exact:true}).first().click();
  await page.locator('[data-instance-id="instance-0"]').getByRole("button",{name:"Content",exact:true}).click();
  await page.getByRole("button",{name:"Pack builder",exact:true}).click();
  const composer = page.getByRole("dialog",{name:"Pack builder"});
  await composer.getByText("Suggest with Ollama",{exact:true}).click();
  await composer.getByLabel("Ollama model").fill("qwen2.5:3b");
  await composer.getByLabel("What kind of pack?").fill("A lightweight survival pack");
  await composer.getByRole("button",{name:"Suggest mods",exact:true}).click();
  await expect(composer.getByRole("checkbox",{name:"Sodium",exact:true})).toBeChecked();
  await expect(composer).toContainText("No compatible release");
  await composer.getByRole("button",{name:"Review install plan (1)"}).click();
  await expect(composer).toHaveCount(0);
  await expect(page.getByText("Required dependency",{exact:true})).toBeVisible();
  const calls = () => page.evaluate(() => (globalThis as any).__materialQA.calls as {command:string;args:Record<string,unknown>}[]);
  let recorded = await calls();
  expect(recorded.filter(call=>call.command==="content_project").map(call=>call.args.project).sort()).toEqual(["missing-mod","sodium"]);
  expect(recorded.find(call=>call.command==="install_content")).toBeUndefined();
  const confirm = page.locator(".runtime-dialog").filter({hasText:"Required dependency"});
  await confirm.locator(".compact-action").click();
  await expect.poll(async () => (await calls()).find(call=>call.command==="install_content")?.args).toMatchObject({
    id:"instance-0",project:"verified-sodium",version:"native-checked-version",fingerprint:"confirmed-plan",
  });
});

test("ChatGPT account controls gate suggestions and support disconnect", async ({page}) => {
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.evaluate(() => {
    const qa = (globalThis as any).__materialQA;
    qa.overrides = {
      chatgpt_account: ({action}:{action:string}) => action === "sign_in",
      suggest_pack_mods: () => [],
    };
  });
  await page.getByRole("button",{name:"Library",exact:true}).first().click();
  await page.locator('[data-instance-id="instance-0"]').getByRole("button",{name:"Content",exact:true}).click();
  await page.getByRole("button",{name:"Pack builder",exact:true}).click();
  const composer = page.getByRole("dialog",{name:"Pack builder"});
  await composer.locator("summary").filter({hasText:"Suggest with ChatGPT"}).click();
  await expect(composer.getByLabel("Describe your pack to ChatGPT")).toHaveCount(0);
  await composer.getByRole("button",{name:"Sign in to ChatGPT",exact:true}).click();
  await expect(composer.getByText("ChatGPT connected",{exact:true})).toBeVisible();
  await composer.getByLabel("Describe your pack to ChatGPT").fill("A cozy farming pack");
  await composer.getByRole("button",{name:"Suggest with ChatGPT",exact:true}).click();
  await expect(composer.getByText("No suggestions. Try another recipe or prompt.",{exact:true})).toBeVisible();
  const call = await page.evaluate(() => (globalThis as any).__materialQA.calls.find((entry:any)=>entry.command==="suggest_pack_mods"));
  expect(call.args).toMatchObject({engine:"chatgpt",id:"instance-0",prompt:"A cozy farming pack"});
  expect(call.args).not.toHaveProperty("model");
  await composer.getByRole("button",{name:"Disconnect ChatGPT",exact:true}).click();
  await expect(composer.getByLabel("Describe your pack to ChatGPT")).toHaveCount(0);
});
