import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { syntheticPlanContent } from "../fixtures/plans/seed";
import { sanitizedScreenshot,signIn,signOut } from "../fixtures/ui";

test("exact human review creates one partner-visible accepted baseline",async({page},testInfo)=>{
  test.setTimeout(120_000);
  test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
    "Use the isolated 006 app and database clone");
  await signIn(page,"mcteer");
  const content=syntheticPlanContent();
  content.title=`Synthetic exact review ${testInfo.project.name}`;
  content.assertions=[];content.sourceDependencies=[];
  const created=await page.evaluate(async({customerId,content})=>{
    const session=await (await fetch("/api/auth/session",{cache:"no-store"})).json();
    const actor=session.data as {csrfToken:string;workspace:{id:string};membership:{id:string}};
    const post=async(path:string,body:unknown)=>{
      const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json",
        "x-csrf-token":actor.csrfToken},body:JSON.stringify(body)});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Plan request failed");
      return result.data;
    };
    const draft=await post("/api/plans",{requestKey:crypto.randomUUID(),
      workspaceId:actor.workspace.id,customerId,workloadId:null,audience:"delivery",
      ownerMembershipId:actor.membership.id,content});
    const submitted=await post(`/api/plans/${draft.planId}/submit`,{
      requestKey:crypto.randomUUID(),expectedAggregateVersion:draft.aggregateVersion,
      revisionId:draft.revisionId,contentDigest:draft.contentDigest});
    return {planId:draft.planId,revisionId:submitted.revisionId};
  },{customerId:DEMO_IDS.sharedCustomer,content});
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}/plans/${created.planId}`);
  const review=page.getByRole("region",{name:"Exact plan review"});
  await expect(review).toBeVisible();
  await review.getByRole("button",{name:"Inspect exact revision"}).click();
  await expect(review.getByRole("heading",{name:content.title})).toBeVisible({timeout:30_000});
  await expect(review.getByText(`Revision ${created.revisionId}`)).toBeVisible();
  await expect(review.getByRole("button",{name:"Accept baseline"})).toBeDisabled();
  await review.getByLabel("Decision rationale").fill("Reviewed the exact synthetic plan");
  await expect(review.getByRole("button",{name:"Accept baseline"})).toBeDisabled();
  await review.getByLabel("I reviewed this exact content for delivery suitability").check();
  await review.getByRole("button",{name:"Accept baseline"}).click();
  await expect(review.getByRole("status")).toContainText("Decision recorded",{timeout:20_000});
  const engagement=page.getByRole("link",{name:"Accepted engagement"});
  await expect(engagement).toBeVisible();
  await engagement.click();
  await expect(page.getByRole("heading",{name:content.title})).toBeVisible();
  await expect(page.getByText("This is an internal delivery baseline.")).toBeVisible();
  const axe=await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
    .toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("local-artifacts/006",{recursive:true});
  await sanitizedScreenshot(page,`local-artifacts/006/plan-review-${testInfo.project.name}.png`);
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button",{name:"Open navigation"}).click();
  }
  await signOut(page);
  await signIn(page,"partner");
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}/plans/${created.planId}`);
  await expect(page.getByRole("heading",{name:content.title})).toBeVisible();
  await expect(page.getByRole("region",{name:"Exact plan review"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Revise plan"})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Accepted engagement"})).toBeVisible();
});

test("request changes and reject leave no accepted engagement",async({page},testInfo)=>{
  test.setTimeout(120_000);
  test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
    "Use the isolated 006 app and database clone");
  await signIn(page,"mcteer");
  for(const [action,label,state] of [
    ["request_changes","Request changes","changes requested"],
    ["reject","Reject","rejected"],
  ] as const){
    const content=syntheticPlanContent();
    content.title=`Synthetic ${action} ${testInfo.project.name}`;
    content.assertions=[];content.sourceDependencies=[];
    const created=await page.evaluate(async({customerId,content})=>{
      const session=await (await fetch("/api/auth/session",{cache:"no-store"})).json();
      const actor=session.data as {csrfToken:string;workspace:{id:string};
        membership:{id:string}};
      const post=async(path:string,body:unknown)=>{
        const response=await fetch(path,{method:"POST",headers:{
          "content-type":"application/json","x-csrf-token":actor.csrfToken},
          body:JSON.stringify(body)});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error?.message ?? "Plan request failed");
        return result.data;
      };
      const draft=await post("/api/plans",{requestKey:crypto.randomUUID(),
        workspaceId:actor.workspace.id,customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:actor.membership.id,content});
      return post(`/api/plans/${draft.planId}/submit`,{
        requestKey:crypto.randomUUID(),expectedAggregateVersion:draft.aggregateVersion,
        revisionId:draft.revisionId,contentDigest:draft.contentDigest})
        .then((submitted)=>({planId:draft.planId,revisionId:submitted.revisionId}));
    },{customerId:DEMO_IDS.sharedCustomer,content});
    await page.goto(`/customers/${DEMO_IDS.sharedCustomer}/plans/${created.planId}`);
    const review=page.getByRole("region",{name:"Exact plan review"});
    await review.getByRole("button",{name:"Inspect exact revision"}).click();
    await expect(review.getByText(`Revision ${created.revisionId}`)).toBeVisible();
    await review.getByLabel("Decision rationale").fill(`Synthetic ${action} rationale`);
    await review.getByRole("button",{name:label}).click();
    await expect(review.getByRole("status")).toContainText("Decision recorded");
    await page.reload();
    await expect(page.getByText(`delivery · ${state}`)).toBeVisible();
    await expect(page.getByRole("link",{name:"Accepted engagement"})).toHaveCount(0);
  }
});
