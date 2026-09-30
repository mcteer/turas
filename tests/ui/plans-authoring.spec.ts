import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("manual plan draft persists with an accessible diagram",async({page},testInfo)=>{
  test.setTimeout(90_000);
  test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
    "Use the isolated 006 test database and app");
  await signIn(page,"mcteer");
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}/plans/new`);
  const editor=page.getByRole("region",{name:"Plan editor"});
  await expect(editor).toBeVisible();
  await editor.getByLabel("Title",{exact:true}).fill("Synthetic accessible delivery plan");
  await editor.getByText("Technical design",{exact:true}).click();
  await editor.getByRole("button",{name:"Add diagram"}).click();
  await editor.getByRole("button",{name:"Create draft"}).click();
  await expect(editor.getByRole("status")).toContainText("Draft saved",{timeout:20_000});
  const link=editor.getByRole("link",{name:"Plan detail"});
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading",{name:"Synthetic accessible delivery plan"})).toBeVisible({timeout:20_000});
  await expect(page.getByRole("img",{name:"Describe the flow in words"})).toBeVisible();
  await expect(page.getByRole("table",{name:"Accessible flow"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Synthetic accessible delivery plan"})).toBeVisible({timeout:20_000});
  const axe=await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("local-artifacts/006",{recursive:true});
  await sanitizedScreenshot(page,`local-artifacts/006/plan-authoring-${testInfo.project.name}.png`);
});
