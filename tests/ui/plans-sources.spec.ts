import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import type { PlanDraftContent } from "../../lib/contracts/plan-content";
import { withTransaction } from "../../lib/server/db/client";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";
import { createProfileTestSession } from "../fixtures/profiles";
import { sanitizedScreenshot,signIn } from "../fixtures/ui";

test("withholds a plan title and body after its research source is withdrawn",
  async({page},testInfo)=>{
    test.setTimeout(120_000);
    test.skip(process.env.TURAS_PLAN_FIXTURE_READY!=="1",
      "Use the isolated 006 app and database clone");
    const prepared=await withTransaction(async(db)=>{
      const admin=await createProfileTestSession(db,"mcteer");
      const marker=randomUUID().slice(0,8);
      const source=await ingestVerifiedResearch({
        workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,
        trustedIdentity:"synthetic-fixture-v1",
        location:`https://example.com/plan-ui-source-${marker}`,
        title:"Synthetic UI source",passage:`Synthetic delivery capability ${marker}`,
        supportedClaim:`Synthetic delivery capability ${marker}`,
        publicationAt:"2026-09-28T12:00:00Z",retrievalAt:"2026-09-29T12:00:00Z",
        rights:"Synthetic public fixture",audience:"delivery",
        qualityInput:{rubricVersion:"evidence-quality-v1",R:3,D:4,C:1,
          reliabilityRationale:"Named synthetic source",
          directnessRationale:"Direct synthetic passage",
          corroborationRationale:"Single synthetic source",
          informationType:"product_capability",dateBasis:"publication"},
        checks:{identity:true,scope:true,integrity:true,content:true,
          rationale:"Synthetic source checked",checkVersion:"research-check-v1"},
      },db);
      const sourceId=await materializeCurrentProjection(db,"verified_research",
        source.sourceRevisionId,"delivery");
      if(!sourceId)throw new Error("Synthetic source did not materialize");
      const projection=await db.query<{source_generation:string;content_digest:string;
        locators:unknown[]}>(`SELECT source.source_generation,source.content_digest,
          passage.locators FROM retrieval_sources source
          JOIN retrieval_passages passage ON passage.source_id=source.id
          WHERE source.id=$1 ORDER BY passage.ordinal LIMIT 1`,[sourceId]);
      const content=syntheticPlanContent() as unknown as PlanDraftContent;
      content.title=`Synthetic source-bound plan ${testInfo.project.name}`;
      const dependencyId=randomUUID();
      content.sourceDependencies=[{id:dependencyId,kind:"verified_research",
        sourceRevisionId:source.sourceRevisionId,
        generation:Number(projection.rows[0].source_generation),
        contentDigest:projection.rows[0].content_digest,
        locator:projection.rows[0].locators[0] as PlanDraftContent["sourceDependencies"][number]["locator"]}];
      content.assertions=[{key:"synthetic_research",kind:"attributed_research",
        text:`Synthetic delivery capability ${marker}`,
        sourceDependencyIds:[dependencyId],decisionCritical:false}];
      const created=await submitPlanCommand(admin,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:PLAN_FIXTURE_SCOPE.administratorId,content},db);
      return {admin,sourceRevisionId:source.sourceRevisionId,
        planId:created.planId,title:content.title,claim:`Synthetic delivery capability ${marker}`};
    });
    await signIn(page,"mcteer");
    await page.goto(`/customers/${PLAN_FIXTURE_SCOPE.customerId}/plans/${prepared.planId}`);
    await expect(page.getByRole("heading",{name:prepared.title})).toBeVisible({timeout:30_000});
    await expect(page.getByText(prepared.claim)).toBeVisible();
    await withTransaction(async(db)=>{
      await submitProfileCommand(prepared.admin,PLAN_FIXTURE_SCOPE.customerId,{
        action:"withdraw_source",requestKey:randomUUID(),
        sourceRevisionId:prepared.sourceRevisionId,
        expectedLifecycleVersion:0,rationale:"Synthetic UI source withdrawn"},db);
    });
    await page.reload();
    await expect(page.getByRole("heading",{name:"Review required",level:1}))
      .toBeVisible({timeout:30_000});
    await expect(page.getByText(prepared.claim)).toHaveCount(0);
    await expect(page.getByRole("img",{name:"Customer browser sends requests to the web service."}))
      .toHaveCount(0);
    await page.goto(`/customers/${PLAN_FIXTURE_SCOPE.customerId}/plans`);
    await expect(page.getByText(prepared.title)).toHaveCount(0);
    await expect(page.getByText("Review required").first()).toBeVisible({timeout:30_000});
    const axe=await new AxeBuilder({page}).analyze();
    expect(axe.violations.filter((item)=>["critical","serious"].includes(item.impact ?? "")))
      .toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    mkdirSync("local-artifacts/006",{recursive:true});
    await sanitizedScreenshot(page,`local-artifacts/006/plan-sources-${testInfo.project.name}.png`);
  });
