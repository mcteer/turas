import { Temporal } from '@js-temporal/polyfill';
import type { ExpansionHypothesis } from '../../../lib/contracts/expansion';
export function discoveryHypothesis():ExpansionHypothesis{return {contractVersion:'expansion-v1',title:'Synthetic discovery proposal',
  productKey:'synthetic-product',productLabel:'Synthetic Product',problemKey:'response-latency',intent:'new_product',problem:'Investigate whether response latency matters',
  customerBenefit:'Potential response improvement, subject to validation',currentUse:{kind:'unknown',reason:'No reviewed adoption evidence'},benefit:{kind:'unknown',reason:'Need and baseline are unknown'},
  assertions:[],unknowns:[{text:'Customer need',reason:'Requires customer discovery'}],prerequisites:[],constraints:[],
  alternatives:[{kind:'retain_current_practice',title:'Retain Current Practice',rationale:'Confirm need before changing the existing solution'}],
  proposedEngagement:'Discovery only',nextStep:{action:'Ask the operating owner about the need',validationCriterion:'Record reviewed need evidence',owner:{kind:'unknown',reason:'Operating owner is unknown'}},
  nextReviewDate:Temporal.Now.plainDateISO('UTC').add({days:7}).toString()};}
