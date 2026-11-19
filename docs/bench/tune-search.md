# Search reference player (`search`) on the tuning seeds

`search` is the ceiling of the benchmark: a rollout search that should clearly beat every other
reference player. It is in `src/core/bench/search.ts` and is registered in `BASELINES` as `search`.
It was tuned on tuning seeds only and is frozen as of this commit (rules v1.0.0). No test seed
(100001 and up) was used.

## Design

Rollout search over single actions, one decision at a time:

1. **Shortlist.** end_turn, the action the greedy AI (`greedy-normal`) would take, the action the
   `rule` player would take, every attack and capture, and the best `width` = 6 other legal
   actions ranked by the shared static `evaluate` one step ahead.
2. **Rollouts.** Each shortlisted action is applied to a copy of the state, then the game is played
   forward until `depth` = 5 turns have ended, counting the current one (the rest of my turn,
   opponent, me, opponent, me). My side plays the game's greedy AI. The opponent is played twice,
   once as the greedy AI and once as the rule player; the action keeps the worse of the two
   results, so it holds up against either style. Before a greedy turn, each side first attacks any
   enemy unit standing on one of its cities (the greedy AI only takes favourable fights and
   would otherwise let a capital fall).
3. **Value.** A line scores the mean of `value()` taken at each of its turn ends, not only at its
   last state; this stops the search from putting off a good purchase that the rollout would make
   a turn later anyway. `value()` is: 10 × score difference, 4 × income difference (fading over
   the last 10 rounds), 2 × army strength difference, 0.5 × stars difference, the opponent's
   threat to my units (or mine to theirs, when it is my move) × 3, 0.2 × distance of my units to
   cities that are not mine, and a city-danger term: an enemy unit standing on one of my cities
   (−40, ×8 on the capital) or able to step onto an empty one next turn, roads included (−15,
   ×8 on the capital); the same for the opponent's cities counts at half weight in my favour. A
   decided game is ±1e6, a win sooner and a loss later being better.
4. The action with the best score is played. A turn is ended after 19 actions, so the harness cap of
   20 is never hit.

The game is fully deterministic (combat has no dice; the round's roll comes from the state), so one
rollout per action and opponent model is exact under that model: there is no sampling and no random
number, and the same seed always gives the same game. The budget is a fixed node budget (shortlist
size × 2 opponent models × 5 rollout turns), never wall-clock time.

## Budget and timing

`width` 6, `depth` 5, opponent models greedy and rule. On boxer, with 2 parallel games and another
benchmark running on the box, in the 300-game run below:

- **62.1 ms per decision** on average (the other players: 0.2 to 1.7 ms);
- the search seat takes 7.5 s per game on average (median 7.2 s, 95th percentile 13.4 s, max 16.6 s),
  so a whole game stays well under 30 s.

## Tuning

All tuning was on the tune set, with an in-process script (not committed) playing `search` against
one opponent from both seats:

| Step | Seeds | Result |
| --- | --- | --- |
| Greedy rollouts, depth 3, `evaluate` as value | 51-60 | about 50-60% against rule |
| Own value with score, income, threat | 51-60 | 75% against greedy, 55% against rule |
| Opponent as the worse of greedy and rule | 51-60 | 70% against greedy, 65% against rule |
| City danger term; lost games scored by turn | 51-60 | 70-75% against rule (traces showed lost capitals) |
| Mean value over the line (fixes put-off purchases) | 51-60 | 90% against greedy, 65% against rule |
| Defend step in rollouts, road-aware danger | 51-60 | 85% against greedy, 75% against rule |
| Depth 5 (vs 3) | 51-60 | 90% against rule, 70 ms per decision |
| Depth 5 vs depth 7 | 61-75 | both 93.3% against rule; depth 5 kept (cheaper) |

Small samples (20-30 games each), used to pick directions, not as results. Changing the approach
weight (0.2 to 1) or the stars weight (0.5 to 0.1) made no difference and was left as it was.

## Final tuning table

The frozen version on tuning seeds 101-150 (none of them used while tuning), every pairing from
both seats (300 games). Regenerate with:

```
npm run bench -- run --set tune --seeds 50 --seed-offset 100 --pairs search:rule,search:greedy-normal,search:lookahead --out bench-out/tune-search --parallel 2
npm run bench -- report bench-out/tune-search
```

Games: 300 (seed set: tune). Each pairing is played on the same seeds from both seats.

### Head to head

| A | B | Games | A wins (95% CI) | B wins (95% CI) | Draws | Verdict |
| --- | --- | ---: | --- | --- | ---: | --- |
| greedy-normal | search | 100 | 8.0% (4.1% to 15.0%) | 92.0% (85.0% to 95.9%) | 0 | search better |
| lookahead | search | 100 | 14.0% (8.5% to 22.1%) | 85.0% (76.7% to 90.7%) | 1 | search better |
| rule | search | 100 | 7.0% (3.4% to 13.7%) | 93.0% (86.3% to 96.6%) | 0 | search better |

### Per agent

| Agent | Games | Decisions | Bad decisions (95% CI) | Malformed | Illegal | Timeout | Error | Caps | ms per decision | Cost per game (USD) | Tokens in / out per game |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy-normal | 100 | 7532 | 0.0% (0.0% to 0.1%) | 0 | 0 | 0 | 0 | 0 | 0.2 | 0.0000 | 0 / 0 |
| lookahead | 100 | 5956 | 0.0% (0.0% to 0.1%) | 0 | 0 | 0 | 0 | 0 | 1.7 | 0.0000 | 0 / 0 |
| rule | 100 | 7825 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 0.4 | 0.0000 | 0 / 0 |
| search | 300 | 36384 | 0.0% (0.0% to 0.0%) | 0 | 0 | 0 | 0 | 0 | 62.1 | 0.0000 | 0 / 0 |

### Games

- First seat wins 51.2% (45.5% to 56.8%) of decided games.
- Endings: domination 189, turn_limit 111.
- Average length: 22.5 rounds.

Bad decisions are counted per decision; decisions in one game are not independent, so that interval is optimistic.
