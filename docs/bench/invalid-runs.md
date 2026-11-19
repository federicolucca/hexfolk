# Invalid runs

Runs on the test set that did not complete as planned. Under docs/PROTOCOL.md they are rerun in full
and reported next to the rerun. Their numbers are not results. The raw files stay in
`bench-out/invalid/` (git-ignored, kept on the benchmark host).

## Batch 4, run 1 (2026-11-19)

- `gemini-decision`: 150/150 games played. OpenRouter's account ran out of credit during the
  batch: 1,545 of 8,987 decisions failed with HTTP 402 and were played as end turn. Another
  65 errors came from one-option questions, which were fixed later in f44cad3.
- `nimble-decision`: stopped by hand after 129 games. From about seed 100019, Bespoke's account
  ran out of credit (HTTP 402) and every call failed: 2,283 errors.
- After this run, `npm run bench run` stops a batch on the first HTTP 402 and does not record
  that game.
