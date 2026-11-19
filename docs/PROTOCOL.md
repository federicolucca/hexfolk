# Benchmark protocol, version 1 (2026-11-19)

This file is committed before any final result is produced. After that commit it does not change.
A change means a new version below, with its date and its reason, and every result says which
version it was produced under.

## What is measured

How well different agents play hexfolk (rules v1.0.0, frozen), measured in a repeatable way:
two agents play a full 2-player game on a seeded map, with no graphics, and the harness logs every
decision (`src/core/bench/harness.ts`, command `npm run bench`).

## Agents

| Name | What it is |
| --- | --- |
| `random` | Uniform pick among the legal actions (end turn included), seeded by the game seed and seat. |
| `rule` | Hand-written priority rule in a few lines: capture, winning attack, keep units at cities + 2 (warriors), harvest, research, move towards the nearest city it does not own, end turn. |
| `lookahead` | Short search: tries every legal action on a copy of the state, keeps the best by a static evaluation that includes the damage the opponent could deal next turn; ends the turn when nothing improves. |
| `greedy-normal` | The game's own tuned AI, fed out one action at a time. Extra reference, not a baseline. |
| `llama8b-free`, `ministral3b-free` | Language model, free answer: reads the rules and the state as text and writes one JSON action. |
| `llama8b-typed`, `ministral3b-typed` | Language model, typed answer: reads the same text plus the numbered legal actions and must answer `{"choice":"N"}`, with output constrained by a JSON schema whose only allowed values are the legal numbers. |

Models (OpenRouter): `llama8b` = `meta-llama/llama-3.1-8b-instruct`, `ministral3b` =
`mistralai/ministral-3b-2512`. Temperature 0, request seed = game seed, max 200 output tokens (free)
or 20 (typed). The provider is not pinned, so the models are not guaranteed to be deterministic:
for them the log, not the seed, is what replays a game.

## Harness rules (identical for every agent)

- One decision = one action. The agent sees the full state (the game has no fog of war) and the
  list of legal actions (the free agent is not shown the list).
- A malformed action, an illegal action, an agent error (for a model: an API failure after 3
  retries) or no reply within 60 s is never corrected: it is logged with its reason and the seat's
  turn ends (end turn is applied in its place). It stays counted.
- More than 20 actions in one turn: the turn is ended and the event is logged as a cap, apart from
  bad decisions.
- 2 players, 30 rounds, victory by domination or by score after round 30; equal scores are a draw.

## Seeds

- Tuning set: seeds 1 to 1000. Used for development and for the pilot runs. Already used: 1-50
  (reference players, `docs/bench/tune-baselines.md`). Seeds 1-2 are the language-model pilot.
- Test set: seeds 100001 to 100100. Held out, never used before this commit, used once for the
  final numbers. Each final batch below is run once; if a batch must be rerun (for example an API
  outage), the whole batch is rerun and both runs are reported.

## Final batches (test set)

Every pairing is played on the same seeds from both seats.

1. Reference players: all 6 pairings of `random`, `rule`, `lookahead`, `greedy-normal`, on seeds
   100001-100100 (200 games per pairing, 1200 games).
2. Language models against references: each of the 4 model agents against `random` and against
   `rule`, on seeds 100001-100025 (50 games per pairing, 400 games).
3. Typed against free, same model: `llama8b-typed` vs `llama8b-free` and `ministral3b-typed` vs
   `ministral3b-free`, on seeds 100001-100025 (50 games per pairing, 100 games).

## What is recorded

Per game (`results.csv`, one row per game; the JSONL log per game): seed, seats, winner, ending
(domination or turn limit), rounds, and per seat: decisions, malformed, illegal, timeouts, errors,
caps, time, tokens in and out, cost in USD, final score.

## Statistics

- Every rate has a 95% Wilson score interval.
- A pairing's verdict: A is better than B only if A's win-rate interval lies entirely above B's
  (draws count for neither). If the intervals overlap, the two are "not distinguishable", never
  "one is better".
- Invalid moves = malformed + illegal decisions, per decision, with a Wilson interval. Decisions in
  one game are not independent, so that interval is optimistic; this is stated with the numbers.
  Timeouts and errors are reported apart (they are mostly infrastructure). If errors exceed 2% of
  an agent's decisions, its numbers are flagged.
- The first-seat win rate over all decided games is reported as a check of the mirrored design.

## Questions and expectations (written before any language-model game)

The expectations for the reference players were written after seeing the tuning table
(`docs/bench/tune-baselines.md`); the language-model expectations before any model was called.

| # | Question | Expectation |
| --- | --- | --- |
| Q1 | Does the typed agent beat the free agent of the same model? | Yes, for both models: typed better than free. |
| Q2 | Does a language model beat the simple rule? | No: for all 4 model agents, `rule` is better or the two are not distinguishable; no model agent is better than `rule`. |
| Q3 | Does a language model beat random? | Typed agents: better than `random`. Free agents: not distinguishable from `random`. |
| Q4 | How many invalid moves does each agent make? | Reference players 0. Typed agents under 1% of decisions. Free agents between 10% and 50%. |
| Q5 | Does the 8B model do better than the 3B one? | Against `rule` and `random`, `llama8b` agents have win rates at least as high as the matching `ministral3b` agents, but the difference is not distinguishable. |
| Q6 | How do the reference players rank? | `greedy-normal` > `rule` > `lookahead` > `random`, each step distinguishable, as on the tuning set. |
| Q7 | Does seat order matter? | First-seat win rate between 45% and 60% overall. |

## Reporting

`RESULTS.md` gives, for each question: the expectation above, the result, and confirmed or not
confirmed. A disproved expectation is reported as it is; the protocol, the rules and the seeds are
not changed to make numbers fit. If a rules bug is found during the measurement, the measurement
stops and every game already played is replayed after the fix.

## Versions

- v1, 2026-11-19: first version.
