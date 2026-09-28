# Detection evaluation

Run `npm run eval:detection` for the synthetic regression suite, or `node scripts/evaluate-detection.cjs evaluation/demo-excerpts.json` for the provisional demo excerpts. Redirect stdout to a JSON file to save a report. No microphone, network connection, API key, or paid speech request is used.

The harness runs `js/speech-ai.js` and the actual `handleDetectedVerse` function from `js/app.js`, with the repository's KJV loaded. DOM rendering and the physical projector are stubbed. Auto projection is enabled for this safety evaluation. Direct candidates are counted before Bible validation; rejected candidates cannot become simulated projections. Full-Bible phrase-index suggestions are evaluated as candidates; song detection is outside this scripture benchmark.

## Label a service recording

Copy `service-template.json`, give it a unique service ID, and replace the example events and labels. Keep each whole service in one case so pauses, cooldowns, duplicates and reconnects remain in context. Use milliseconds relative to the recording's start; record the audio filename, speaker/service ID, annotator, review status, and tuning/held-out split in `provenance`. Do not put the same service or speaker in both splits.

1. Listen to the recording independently of the detector's output. Label every intended Bible reference/quotation, its earliest sufficient evidence time (`evidenceAt`), canonical reference, and latest acceptable detection time (`until`). Use distinct label IDs for repeated mentions. Leave labels empty for a fully reviewed no-reference segment. Unreviewed audio must be excluded, not treated as a negative example.
2. Export actual provider partial/final events with their receipt times. `partial` events can be replaced by corrected partials/finals. Preserve all events and pauses; do not turn provisional text into finalized text. An explicit `pause` is optional because timestamps already represent gaps.
3. Insert `disconnect` and `reconnect` events. Generation starts at zero and increments on reconnect. Tag transcript events with `generation` to exercise stale callback rejection. Disconnected/stale events are ignored. This models delivery boundaries; the microphone/socket lifecycle is tested separately in `tests/speech-lifecycle.test.js`.
4. Optionally add `projection` events with actual observed projection timestamps and references. They are marked `observed`, separate from `auto-policy` events in each case. Do not equate simulated policy decisions with real screen output.
5. Run the file through the CLI; inspect individual misses, false candidates and wrong projections, not just aggregate scores. Retain reviewer corrections with the dataset.

## Metric definitions and limits

- A hit requires an exact canonical reference inside its label's evidence/deadline interval. A reference range is one label. Overlapping windows for the same reference should be avoided.
- Recall = labels with at least one matching candidate / labels. Missed labels are listed by ID.
- Every unmatched candidate event is a false candidate, including premature chapter suggestions. Repeated matching events remain visible but count as one recall hit.
- Every unmatched projection event is a wrong projection. Counts and rates are broken down by observed versus simulated source. Rates divide by the labeled case duration, including its pauses.
- Latency is first matching candidate time minus evidence time; p50/p95 use nearest rank. No hits means null, not zero. Synthetic timing cannot establish real latency. For genuine end-to-end timing, evidence timestamps must come from the audio and receipt/projection timestamps from the live system on the same clock.

`regression.json` is intentionally adversarial and includes known failures; it is a baseline, not an accuracy claim or a passing production acceptance threshold. Its short duration makes hourly extrapolations especially unsuitable as service-rate predictions.

`demo-excerpts.json` contains only three screen-transcript excerpts from the supplied Pewbeam demo, with provisional reference labels and synthetic replay timings. These are not independently transcribed audio, not a complete service, and not a fair provider accuracy comparison. Real-service independent labeling and live audio-to-screen measurement remain pending; no such corpus was supplied.


Task 7 adds the same `QuotationIndex` implementation used by the browser worker to offline replay. It builds from local KJV once per CLI process. Replay does not include worker scheduling/build time in latency; browser worker integration is separately covered by tests. Historical task-4 and task-5/6 results are retained; `task-7-demo-results.json` and `task-7-regression-results.json` contain the new comparison outputs.

Task 8's semantic evaluation is separate from the synchronous lexical replay. `node scripts/evaluate-semantic-runtime.cjs` runs the real local embedding worker against `semantic-cases.json` and writes `semantic-runtime-results.json`. `semantic-model-benchmark.json` records the initial 1,012-verse comparison, and `semantic-full-results.json` records rankings against all 31,102 verses. These cases were authored for development, not labeled from held-out service recordings. Report raw top-reference recall separately from the stricter accepted-suggestion recall, and do not count an abstention as a successful detection. Runtime results include model loading in the first query's latency.

Tasks 9–10 replay uses the production `AutoProjectionPolicy` and a deterministic timer queue. Candidate latency is still evidence-to-detection, while each simulated projection timestamp now includes stability and minimum-display delays. Disconnect events cancel queued projection. The UI diagnostics export records operator selections/rejections and suppression/failure reasons for review; those events need human interpretation before being used as correctness labels.
