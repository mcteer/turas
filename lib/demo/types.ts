export type EngagementStage = "Discover" | "Prove" | "Promote";

export type Evidence = {
  id: string;
  label: string;
  observedAt: string;
  confidence: "High" | "Medium" | "Low";
  detail: string;
};

export type Customer = {
  id: string;
  name: string;
  aliases: string[];
  objective: string;
  workspaceId: string;
};

export type Engagement = {
  id: string;
  accountId: string;
  name: string;
  stage: EngagementStage;
  customerOwner: string;
  deliveryOwner: string;
  nextDecision: string;
  decisionDeadline: string;
  outcome: string;
  scope: string;
  exclusions: string;
  fee: number;
  actualHours: number;
  remainingHours: number;
  loadedHourlyCost: number;
  nonLaborCost: number;
  risk: string;
  maturity: string;
  evidence: Evidence[];
  proposedIntervention?: {
    id: string;
    description: string;
    remainingHours: number;
    requiredSkill: string;
    startDate: string;
    owner: string;
  };
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  skill: string;
  weeklyAvailableHours: number;
  committedHours: number;
  protectedHours: number;
};

export type DemoData = {
  version: string;
  reportingDate: string;
  workspaceId: string;
  customers: Customer[];
  engagements: Engagement[];
  team: TeamMember[];
};
