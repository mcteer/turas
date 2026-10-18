import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const content=readFileSync('lib/conversations/ordinary-instructions.md','utf8');
it('routes ordinary approved-knowledge and adoption reads through real tools without authorizing dedicated workflow writes',()=>{
 for(const tool of ['search_solution_patterns','get_solution_knowledge','review_solution_pattern','review_solution_application','get_adoption_patterns','get_learning_contribution','review_learning_contribution']){
  expect(content).toContain('`'+tool+'`');
  const authored=readFileSync('agent/tools/'+tool+'.ts','utf8');expect(authored).toContain('normalChatTool');
 }
 expect(content).toContain('load the `customer-learning` skill');expect(content).toContain('Dedicated delivery-plan, staffing,');expect(content).toContain('server-bound contexts');expect(content).toContain('These decisions record a reviewed plan; they execute no');
 expect(content).not.toContain('Delivery, staffing, support, expansion and learning tools are available only');
});
it('preserves legacy counterfactual direction, offline blockers, separate consent and causal abstention as authored guidance',()=>{
 for(const clause of ['could not have succeeded without X','could not have succeeded with X','dropping “without,” “not,” or a condition','Unsupported air-gap capability is a disqualifier','regional hosting\ndoes not satisfy an offline requirement','approval of a customer record is not consent to share it','Unknown or incompatible prerequisites','context_changed','pattern_unavailable','do not search or concatenate private account notes','Training attendance alone is not active adoption','Association does not establish\ncausal services ROI','A hypothetical\nquestion does not authorize capture'])expect(content).toContain(clause);
});
