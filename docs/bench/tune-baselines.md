# Reference players on the tuning seeds

Phase 2 table: tuning seeds 1-50, every pairing from both seats (600 games), rules v1.0.0. Regenerate with:

```
npm run bench -- run --set tune --seeds 50 --pairs rule:random,lookahead:random,greedy-normal:random,lookahead:rule,greedy-normal:rule,greedy-normal:lookahead --out bench-out/tune
npm run bench -- report bench-out/tune
```

Games: 600 (seed set: tune). Each pairing is played on the same seeds from both seats.

### Head to head

| A | B | Games | A wins (95% CI) | B wins (95% CI) | Draws | Verdict |
| --- | --- | ---: | --- | --- | ---: | --- |
| greedy-normal | lookahead | 100 | 73.0% (63.6% to 80.7%) | 24.0% (16.7% to 33.2%) | 3 | greedy-normal better |
| greedy-normal | random | 100 | 98.0% (93.0% to 99.4%) | 2.0% (0.6% to 7.0%) | 0 | greedy-normal better |
| greedy-normal | rule | 100 | 62.0% (52.2% to 70.9%) | 36.0% (27.3% to 45.8%) | 2 | greedy-normal better |
| lookahead | random | 100 | 98.0% (93.0% to 99.4%) | 2.0% (0.6% to 7.0%) | 0 | lookahead better |
| lookahead | rule | 100 | 23.0% (15.8% to 32.2%) | 75.0% (65.7% to 82.5%) | 2 | rule better |
| random | rule | 100 | 2.0% (0.6% to 7.0%) | 98.0% (93.0% to 99.4%) | 0 | rule better |

### Per agent

| Agent | Games | Decisions | Bad decisions (95% CI) | Malformed | Illegal | Timeout | Error | Caps | ms per decision | Cost per game (USD) | Tokens in / out per game |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy-normal | 300 | 30423 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 0.2 | 0.0000 | 0 / 0 |
| lookahead | 300 | 28201 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 2.6 | 0.0000 | 0 / 0 |
| random | 300 | 21132 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 0.1 | 0.0000 | 0 / 0 |
| rule | 300 | 26421 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 0.1 | 0.0000 | 0 / 0 |

### Games

- First seat wins 54.0% (49.9% to 57.9%) of decided games.
- Endings: domination 384, turn_limit 216.
- Average length: 22.7 rounds.

Bad decisions are counted per decision; decisions in one game are not independent, so that interval is optimistic.
