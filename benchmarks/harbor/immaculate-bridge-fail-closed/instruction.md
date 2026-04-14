Read `/app/report_excerpt.json` and write `/app/response.json`.

The output must be valid JSON with exactly these keys:

- `route`
- `reason`
- `commit`

Rules:

- `route` must be one of: `reflex`, `cognitive`, `guarded`, `suppressed`
- `reason` must be 24 words or fewer
- `commit` must be 24 words or fewer
- ground the answer only in `report_excerpt.json`
- do not claim healthy bridge delivery when the report shows degradation
- do not add markdown, prose outside the JSON object, or extra keys

Pick the next orchestration move as an honest operator would: safe, bounded, and fail-closed if the report does not justify a reflex path.
