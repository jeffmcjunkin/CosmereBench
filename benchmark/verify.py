"""Check public grades, edition selection and the comparison report without an API key."""
import json
import math
from collections import Counter
from fractions import Fraction
from pathlib import Path

from analyze import analyze

DATA = Path(__file__).resolve().parents[1] / "data"


def load(name):
    return json.loads((DATA / (name + ".json")).read_text())


def exclusion_reason(correct, total, minimum, upper):
    if correct < minimum:
        return "zero_correct"
    if correct * upper.denominator >= total * upper.numerator:
        return "at_or_above_upper_cutoff"
    return None


def verify_bank(questions, runs, model_ids, minimum, upper, archived):
    ids = {q["id"] for q in questions}
    assert len(ids) == len(questions)
    assert len(runs) == len(model_ids)
    assert {r["id"] for r in runs} == model_ids
    answers = {r["id"]: r["answers"] for r in runs}
    for row in answers.values():
        assert set(row) == ids
        for answer in row.values():
            assert type(answer["correct"]) is bool and (answer["text"].strip() or not answer["correct"])
            attempts = answer["attempts"]
            assert attempts and math.isclose(sum(x["cost"] for x in attempts), answer["cost"], abs_tol=1e-8)
            assert all(x["cost"] >= 0 and "requestId" not in x for x in attempts)
    for q in questions:
        options = q["options"]
        assert 0 <= q["key"] < len(options) and len(set(options)) == len(options)
        choice = options[q["key"]]
        assert choice == q["answer"] or (choice == "None of the above" and q["answer"] not in options)
        assert q["sourceUrl"].startswith("https://") and q["explanation"].strip()
        count = sum(row[q["id"]]["correct"] for row in answers.values())
        assert count == q["correctModels"], q["id"]
        reason = exclusion_reason(count, len(runs), minimum, upper)
        assert bool(reason) == archived, q["id"]
        assert q.get("exclusionReason") == reason, q["id"]
        if archived:
            assert q["auditNote"].strip(), q["id"]
        if count:
            witness = answers[q["witnessModel"]][q["id"]]
            assert witness["correct"] and witness["text"].strip(), q["id"]
    return ids


def main():
    protocol, questions, runs, excluded = map(load, ("protocol", "questions", "runs", "excluded"))
    total = protocol["selectionModelCount"]
    minimum = protocol["selectionMinimumCorrect"]
    upper = Fraction(str(protocol["selectionMaximumAccuracyExclusive"]))
    assert protocol["version"] == excluded["edition"] == "2.1"
    assert (total, minimum, upper) == (30, 1, Fraction(9, 10))
    assert excluded["modelCount"] == len(runs) == total
    boundary_cases = protocol["selectionBoundaryCases"]
    assert [c["correctModels"] for c in boundary_cases] == [0, 1, 26, 27]
    for c in boundary_cases:
        reason = exclusion_reason(c["correctModels"], total, minimum, upper)
        assert c.get("exclusionReason") == reason and c["retained"] is (reason is None)

    model_ids = {r["id"] for r in runs}
    active_ids = verify_bank(questions, runs, model_ids, minimum, upper, archived=False)
    excluded_ids = verify_bank(excluded["questions"], excluded["runs"], model_ids, minimum, upper, archived=True)
    assert load("pool-keys") == {q["id"]: q["key"] for q in questions}
    assert active_ids.isdisjoint(excluded_ids)
    candidates = active_ids | excluded_ids
    assert candidates == {f"CB-{i:03}" for i in range(1, protocol["candidateQuestions"] + 1)}
    assert len({q["prompt"] for q in questions + excluded["questions"]}) == len(candidates)

    original = {f"CB-{i:03}" for i in range(1, protocol["originalQuestions"] + 1)}
    assert len(candidates) == protocol["candidateQuestions"] == 136
    assert len(original) == 100 and len(candidates - original) == protocol["newCandidates"] == 36
    assert len(active_ids) == protocol["retainedQuestions"] == 127
    assert len(active_ids & original) == protocol["retainedOriginalQuestions"] == 92
    assert len(active_ids - original) == protocol["retainedNewQuestions"] == 35
    assert excluded_ids & original == set(protocol["removedQuestions"])
    assert excluded_ids == set(protocol["excludedQuestions"])
    counts = Counter(q["exclusionReason"] for q in excluded["questions"])
    assert counts == {
        "zero_correct": protocol["excludedZeroCorrectQuestions"],
        "at_or_above_upper_cutoff": protocol["excludedHighAccuracyQuestions"],
    }
    assert (counts["zero_correct"], counts["at_or_above_upper_cutoff"]) == (8, 1)
    assert {q["id"] for q in excluded["questions"] if q["correctModels"] >= 27} == {"CB-033"}

    analysis = load("analysis")
    assert analysis == analyze(questions, runs), "Rebuild the analysis with benchmark/analyze.py"
    print(f"{len(active_ids)} retained questions × {total} models = {len(active_ids) * total:,} grades. "
          f"{len(excluded_ids)} excluded questions, {len(candidates) * total:,} total candidate grades, "
          f"{len(analysis['pairs'])} verified model pairs.")


if __name__ == "__main__":
    main()
