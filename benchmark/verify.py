"""Check every public grade, the release selection and the comparison report. No API key needed."""
from itertools import combinations
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"

def load(name):
    return json.loads((DATA / (name + ".json")).read_text())

def verify_bank(questions, runs, retained):
    ids = {q["id"] for q in questions}
    assert len(ids) == len(questions)
    assert len({q["prompt"] for q in questions}) == len(ids)
    for model in runs:
        assert set(model["answers"]) == ids, model["id"]
        for a in model["answers"].values():
            assert type(a["correct"]) is bool and (a["text"].strip() or not a["correct"])
            assert a["attempts"] and math.isclose(sum(x["cost"] for x in a["attempts"]), a["cost"], abs_tol=1e-8)
            assert all(x["cost"] >= 0 and "requestId" not in x for x in a["attempts"])
    for q in questions:
        options = q["options"]
        assert 0 <= q["key"] < len(options) and len(set(options)) == len(options)
        correct_choice = options[q["key"]]
        assert correct_choice == q["answer"] or (correct_choice == "None of the above" and q["answer"] not in options)
        assert q["sourceUrl"].startswith("https://") and q["explanation"].strip()
        count = sum(model["answers"][q["id"]]["correct"] for model in runs)
        if retained:
            witness = next(r for r in runs if r["id"] == q["witnessModel"])["answers"][q["id"]]
            assert witness["correct"] and witness["text"].strip()
        assert count == q["correctModels"] and (count > 0) == retained, q["id"]
    return ids

def main():
    protocol, questions, runs, excluded, analysis = map(load, ("protocol","questions","runs","excluded","analysis"))
    active_ids = verify_bank(questions, runs, True)
    excluded_ids = verify_bank(excluded["questions"], excluded["runs"], False)
    models = {r["id"] for r in runs}
    assert len(models) == len(runs) == 30
    assert models == {r["id"] for r in excluded["runs"]}
    assert load("pool-keys") == {q["id"]:q["key"] for q in questions}
    assert active_ids.isdisjoint(excluded_ids)
    assert len(active_ids | excluded_ids) == protocol["candidateQuestions"]
    assert set(protocol["excludedQuestions"]) == excluded_ids
    assert set(analysis["order"]) == models
    expected_pairs = set(combinations(sorted(models), 2))
    assert {(p["a"],p["b"]) for p in analysis["pairs"]} == expected_pairs
    for p in analysis["pairs"]:
        assert set(p["missed"]) <= active_ids
    print(f"{len(active_ids)} retained questions, {len(excluded_ids)} excluded, "
          f"{len(models)*len(active_ids):,} retained answers, {len(expected_pairs)} model pairs. "
          "Every retained question has a nonempty correct model response.")

if __name__ == "__main__":
    main()
