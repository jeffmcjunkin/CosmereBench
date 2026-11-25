# CosmereBench

[Take the quiz and explore the results](https://jeffmcjunkin.com/CosmereBench/)

CosmereBench compares readers and 30 language models on Brandon Sanderson’s Cosmere. Play a random 15-question round or work through all 128. Each reveal shows the source, a short explanation, the model responses and the first-answer reader totals. The quiz contains spoilers.

The price–accuracy Pareto frontier shows which models delivered the best score at each cost. Compare all questions or just the ones you answered. Explore the score table, category breakdowns, shared mistakes, wording similarities and punctuation. The source library also shows how many models answered each question correctly. Inspired by [mjr’s SK Bench](https://skbench.doesthispersonexist.com/).

## What edition 2.0 measures

We evaluated 136 candidate questions, including the 100 from the first edition and 36 new questions. The new material draws on earlier publications. We retained 93 original and 35 new questions. Every retained question has at least one verified correct, closed-book model response. The hardest retained questions had 1 correct response out of 30. The published score table contains 3,840 individual grades. It reuses the original responses for retained questions and includes new responses for each addition.

Selection used the same models that appear on the leaderboard. This changes the difficulty and limits what these scores say about the wider Cosmere. Compare rankings within one edition. The [8 excluded questions and their responses](data/excluded.json) remain available for audit. A miss by every model does not establish a training cutoff.

Models received the question in a fresh OpenRouter request without answer choices, source text, tools or conversation history. Readers get multiple-choice questions. Two judges evaluated anonymous responses against the reference answer. Disagreements and the evidence for retained questions received source-based review. Each changed grade carries a review note. Sharply different wrong answers can earn the same binary grade.

## Data

- [Questions, answer keys, sources and correct-model counts](data/questions.json)
- [Model responses, final grades, attempts, token usage and costs](data/runs.json)
- [Prompts, collection and grading protocol](data/protocol.json)
- [Pairwise comparison data](data/analysis.json)

The chart uses the OpenRouter inference costs recorded for these runs, including retries, scaled to 100 questions. Grading costs are excluded. Availability and provider pricing can change. The archive download in the site includes the release questions, model outputs and protocol in a single JSON file.

## Run locally

Use Node.js 24 or later and Python 3.10 or later. Reading, building and verifying the published edition use only the checked-in data.

```sh
npm ci
python3 benchmark/verify.py
npm run build
python3 -m http.server --directory dist 8080
```

Open [the local quiz](http://localhost:8080). Quiz progress and first choices are stored in the browser. To update the pooled scores, the public site sends a random browser identifier, question ID and first choice to the community score service. The code returns aggregate counts. Offline submissions are queued for reconnect. The local preview does not post to the public pool.

GitHub Actions verifies the release and publishes the static build to GitHub Pages on pushes to main. The public quiz and results work without an account or an API key. The [community service](community/community.ts) runs on the original Site’s Worker with a D1 answers table. The public Pages application handles the quiz, scoring and charts locally. The frontier gives equal weight to readers who have answered at least 10 retained questions. Category and per-question totals include every browser’s first answer.

To collect independent model responses and judge them again, supply your own OpenRouter credential and choose a budget in USD. Model IDs and historical price fallbacks are in [the model roster](benchmark/models.json). The runner saves response and grading logs incrementally and resumes from the same directory. Running this command makes billable requests.

```sh
python3 benchmark/run.py --questions data/questions.json --log-dir local-runs \
  --key-file /path/to/openrouter-key.txt --budget 10
```

CosmereBench is an independent fan project. Brandon Sanderson and the cited publishers own the source material. Font licenses are included in [public/fonts](public/fonts/).
