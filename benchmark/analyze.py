"""Build the shared-mistakes report from the published question bank and model runs."""

import argparse
import itertools
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

DATA = Path(__file__).resolve().parents[1] / "data"
WORDS = re.compile(r"[^\W_]+", flags=re.UNICODE)
STOP = set("""
a an and are as at be been being but by can could did do does doing down during
each either for from had has have he her here hers herself him himself his how
however i if in into is it its itself just like made makes may might more most
much must my no nor not of off on once one only or other our out over own rather
she so some such than that the their theirs them themselves then there therefore
these they this those through to too under up upon us was we well were what when
where whether which while who whom whose why will with without would you your
answer answers actually because book books called character correct fact false
first known name named premise question refers said says story true
""".split())
CURLY = set("‘’“”")
MARKS = CURLY | set("'\u0022")


def words(text):
    return {w for w in WORDS.findall(text.casefold()) if len(w) >= 3 and w not in STOP}


def phi(paired_grades):
    counts = Counter(paired_grades)
    a, b, c, d = (counts[key] for key in [(True, True), (True, False), (False, True), (False, False)])
    denominator = math.sqrt((a + b) * (c + d) * (a + c) * (b + d))
    return (a * d - b * c) / denominator if denominator else None


def cluster_order(ids, pair_phis):
    # Average-linkage clustering on right/wrong vectors. Order the two branches
    # at each merge to put similar leaves together at the join.
    clusters = [(model,) for model in sorted(ids)]

    def distance(a, b):
        value = pair_phis[tuple(sorted((a, b)))]
        return 1 - (value if value is not None else 0)

    while len(clusters) > 1:
        def separation(pair):
            left, right = pair
            return mean(distance(a, b) for a in left for b in right), left, right

        left, right = min(itertools.combinations(clusters, 2), key=separation)
        orders = [(u, v) for u in (left, left[::-1]) for v in (right, right[::-1])]
        u, v = min(orders, key=lambda branches: (
            distance(branches[0][-1], branches[1][0]), branches))
        clusters.remove(left)
        clusters.remove(right)
        clusters.append(u + v)
        clusters.sort()
    return list(clusters[0]) if clusters else []


def analyze(questions, runs):
    models = {row["id"]: row["answers"] for row in runs}
    ids = sorted(models)
    question_ids = [q["id"] for q in questions]
    pairs = {}
    for a, b in itertools.combinations(ids, 2):
        common = [qid for qid in question_ids if qid in models[a] and qid in models[b]]
        grades = [(models[a][qid]["correct"], models[b][qid]["correct"]) for qid in common]
        missed = [qid for qid, grades_ab in zip(common, grades) if grades_ab == (False, False)]
        pairs[(a, b)] = dict(a=a, b=b, phi=phi(grades), missed=missed, excess=0)

    residuals = defaultdict(list)
    shared = []
    for q in questions:
        qid = q["id"]
        rows = {m: models[m][qid] for m in ids if qid in models[m]}
        prompt_words = words(q["prompt"])
        vocabulary = {m: words(row["text"]) - prompt_words for m, row in rows.items()}
        correct_words = words(q["answer"])
        for m, row in rows.items():
            if row["correct"]:
                correct_words.update(vocabulary[m])

        comparison_groups = defaultdict(list)
        for a, b in itertools.combinations(rows, 2):
            left, right = vocabulary[a], vocabulary[b]
            common = left & right
            grade_pattern = int(rows[a]["correct"]) + int(rows[b]["correct"])
            if left and right:
                similarity = len(common) / len(left | right)
                comparison_groups[grade_pattern].append(((a, b), similarity))
            distinctive = common - correct_words
            if grade_pattern == 0 and len(distinctive) >= 4:
                shared.append(dict(id=qid, a=a, b=b, words=sorted(distinctive),
                                   ta=rows[a]["text"], tb=rows[b]["text"]))

        # A pair must have a peer with the same right/wrong pattern on this
        # question. Compare against the other pairs, excluding the pair itself.
        for group in comparison_groups.values():
            if len(group) < 2:
                continue
            total = sum(similarity for _, similarity in group)
            for pair, similarity in group:
                baseline = (total - similarity) / (len(group) - 1)
                residuals[pair].append(similarity - baseline)

    for pair, differences in residuals.items():
        pairs[pair]["excess"] = 100 * mean(differences)
    wording = sorted((pairs[pair] for pair in residuals), key=lambda row: (-row["excess"], row["a"], row["b"]))
    quotes = []
    for m in ids:
        counts = Counter(ch for qid in question_ids if qid in models[m] for ch in models[m][qid]["text"] if ch in MARKS)
        quotes.append(dict(id=m, curly=sum(counts[c] for c in CURLY), total=sum(counts.values())))
    order = cluster_order(ids, {pair: row["phi"] for pair, row in pairs.items()})
    return dict(order=order, pairs=list(pairs.values()), wording=wording, quotes=quotes, shared=shared)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA)
    args = parser.parse_args()
    questions = json.loads((args.data_dir / "questions.json").read_text())
    runs = json.loads((args.data_dir / "runs.json").read_text())
    result = analyze(questions, runs)
    output = args.data_dir / "analysis.json"
    temp = output.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    temp.replace(output)
    print(f"{len(runs)} models, {len(result['pairs'])} pairs, {len(result['shared'])} shared-word matches")


if __name__ == "__main__":
    main()
