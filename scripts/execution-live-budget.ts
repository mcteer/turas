import {EXECUTION_EVAL_IDS} from "./verify-execution-review";
/** Reservations happen before transport. An uncertain HTTP acknowledgement uses
 * its allowance permanently; only a new explicit CLI run has a fresh budget. */
export class ExecutionLiveBudget {
  readonly startedAt:number;readonly deadlineAt:number;private readonly admitted=new Set<string>();
  constructor(private readonly now:()=>number=Date.now){this.startedAt=now();this.deadlineAt=this.startedAt+1200000;}
  get dispatches(){return this.admitted.size;}
  assertRemaining(){if(this.now()>=this.deadlineAt)throw new Error("Execution live suite deadline reached");return this.deadlineAt-this.now();}
  reserve(id:typeof EXECUTION_EVAL_IDS[number]){
    this.assertRemaining();if(!EXECUTION_EVAL_IDS.includes(id)||this.admitted.has(id)||this.admitted.size>=8)throw new Error("Execution live turn was already reserved or is outside this suite");
    this.admitted.add(id);return Math.min(this.now()+120000,this.deadlineAt);
  }
}
