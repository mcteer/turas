import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {z} from 'zod';
import {authoredTool} from '../../agent/tools/search_evidence';

it('defaults guidance to current evidence and requires explicit historical intent',()=>{
 const schema=authoredTool.inputSchema as z.ZodType;
 expect(schema.parse({query:'Vercel deployment guidance'})).toMatchObject({use:'current_fact'});
 for(const use of ['accepted_fact','discovery'])expect(schema.parse({query:'Historical deployment evidence',use})).toMatchObject({use});
 expect(schema.safeParse({query:'guidance',use:'ignore_freshness'}).success).toBe(false);
});

it('does not instruct ordinary chat to bypass the current-evidence default for guidance',()=>{
 const prompt=readFileSync('lib/conversations/ordinary-instructions.md','utf8');
 expect(prompt).toMatch(/`scope: 'shared'`; use `current_fact` for present-day guidance and\s+`discovery` for explicit exploration/);
 expect(prompt).toContain('`accepted_fact` only for explicit factual history');
 expect(prompt).not.toMatch(/simple\s+shared-guidance question[^\n]*use: 'discovery'/);
 expect(prompt).not.toContain('with the resolved `accountId`, `accepted_fact`');
});
