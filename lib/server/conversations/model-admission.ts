import { admitExpansionModelStep, assertExpansionProviderRelease } from "../expansion/native-admission";
import { admitLearningDraftModelStep,assertLearningDraftProviderRelease } from '../learning/native-admission';
import { hiddenRecord } from "../../contracts/http";
import { admitSupportModelStep, assertSupportProviderRelease } from "../support/native-admission";
import { responseFeature, type FeaturePrincipal } from "./feature";
import { admitStaffingNativeModelStep, assertStaffingNativeProviderRelease } from "../staffing/native-admission";
import { admitExecutionModelStep, assertExecutionProviderRelease, type ExecutionModelIdentity } from "../execution/native-admission";
/** The immutable server binding, never a caller flag, selects model governance. */
export async function admitGovernedModelStep(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  const feature = await responseFeature(principal);
  if(feature?.kind==='learning')return {kind:'learning' as const,...await admitLearningDraftModelStep(principal,identity)};
  if (feature?.kind === "expansion") return {kind:"expansion" as const,...await admitExpansionModelStep(principal,identity)};
  if (feature?.kind === "support") return { kind: "support" as const, ...await admitSupportModelStep(principal, identity) };
  if (feature?.kind === "execution") return { kind: "execution" as const, ...await admitExecutionModelStep(principal, identity) };
  if (feature?.kind === "staffing") return { kind: "staffing" as const, ...await admitStaffingNativeModelStep(principal, identity) };
  throw hiddenRecord();
}
export async function assertGovernedProviderRelease(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  const feature = await responseFeature(principal);
  if(feature?.kind==='learning'){await assertLearningDraftProviderRelease(principal,identity);return;}
  if (feature?.kind === "expansion") return assertExpansionProviderRelease(principal,identity);
  if (feature?.kind === "support") return assertSupportProviderRelease(principal, identity);
  if (feature?.kind === "execution") return assertExecutionProviderRelease(principal, identity);
  if (feature?.kind === "staffing") return assertStaffingNativeProviderRelease(principal, identity);
  throw hiddenRecord();
}
