"""Replay the first evidence-search decision; never execute a tool call."""

import argparse
import json
import os
import re
from subprocess import check_output

from run import Gateway, ROOT, TASK_MODEL

SOURCE = 'lib/conversations/ordinary-instructions.md'
BASELINE = 'b9dc4ab3'
ACCOUNT = 'a480deb4-806e-4aba-83b3-bbe63b3601e0'
CASES = [
    ('current-shared', 'Check retained shared evidence for current Vercel build guidance.', 'shared', 'current_fact'),
    ('current-account', 'Check retained evidence for which framework this account uses today.', 'customer', 'current_fact'),
    ('history', 'Search the accepted historical record: what framework did this account use in 2024? Do not answer about today.', 'customer', 'accepted_fact'),
    ('discovery', 'Explore uncertain accounts of which framework this account evaluated; I want leads, not accepted facts.', 'customer', 'discovery'),
]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--live', action='store_true')
    cli.add_argument('--run-id', default='freshness-routing')
    args = cli.parse_args()
    if not re.fullmatch(r'[a-z0-9-]{1,50}', args.run_id):
        cli.error('run ID must contain only lowercase letters, digits and hyphens')
    description, = re.findall(r'^  description: (".*"),$',
                             (ROOT / 'agent/tools/search_evidence.ts').read_text(), re.M)
    tools = [{'type': 'function', 'function': {'name': 'search_evidence',
              'description': json.loads(description), 'parameters': {'type': 'object',
              'additionalProperties': False, 'required': ['query'], 'properties': {
                  'query': {'type': 'string', 'minLength': 1, 'maxLength': 500},
                  'accountId': {'type': 'string', 'format': 'uuid'},
                  'scope': {'enum': ['customer', 'shared', 'combined'], 'default': 'combined'},
                  'use': {'enum': ['current_fact', 'accepted_fact', 'discovery'], 'default': 'current_fact'},
                  'limit': {'type': 'integer', 'minimum': 1, 'maximum': 10, 'default': 5},
              }}}}]
    base = check_output(['git', 'show', f'{BASELINE}:{SOURCE}'], cwd=ROOT, text=True)
    changed = (ROOT / SOURCE).read_text()
    root = (ROOT / 'agent/instructions.md').read_text()
    if not args.live:
        print(f'Checked routing fixture: {len(CASES)} cases; no Gateway traffic')
        return
    if not os.environ.get('AI_GATEWAY_API_KEY'):
        cli.error('set AI_GATEWAY_API_KEY via a protected local input')
    gateway = Gateway(os.environ['AI_GATEWAY_API_KEY'])
    directory = ROOT / 'local-artifacts/prompt-tuning'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = directory / f'{args.run_id}.json'
    with path.open('x', encoding='utf-8') as handle:
        os.chmod(path, 0o600)
        results = []
        try:
            for case, question, expected_scope, expected_use in CASES:
                for replicate in range(2):
                    arms = [('baseline', base), ('revised', changed)]
                    if replicate:
                        arms.reverse()
                    for arm, content in arms:
                        system = root + '\n\n' + content
                        if expected_scope == 'customer':
                            system += f'\nThe authorized canonical account ID for the active synthetic customer is {ACCOUNT}.'
                        calls = gateway.complete(TASK_MODEL, [
                            {'role': 'system', 'content': system}, {'role': 'user', 'content': question},
                        ], tools=tools)
                        call = calls[0].get('function', {}) if len(calls) == 1 else {}
                        try:
                            values = json.loads(call.get('arguments', '{}'))
                        except (ValueError, TypeError):
                            values = {}
                        if not isinstance(values, dict):
                            values = {}
                        scope, use = values.get('scope', 'combined'), values.get('use', 'current_fact')
                        account = values.get('accountId')
                        passed = (call.get('name') == 'search_evidence' and bool(values.get('query'))
                                  and scope == expected_scope and use == expected_use
                                  and account == (ACCOUNT if expected_scope == 'customer' else None))
                        results.append({'case': case, 'replicate': replicate + 1, 'arm': arm,
                                        'scope': scope, 'use': use, 'passed': passed})
        finally:
            json.dump({'results': results, 'requests': dict(gateway.requests), 'tokens': dict(gateway.tokens),
                       'gateway_failure': gateway.failure}, handle, indent=2)
    for arm in ('baseline', 'revised'):
        rows = [item for item in results if item['arm'] == arm]
        print(f'{arm}: {sum(row["passed"] for row in rows)}/{len(rows)} expected first tool calls')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from None
