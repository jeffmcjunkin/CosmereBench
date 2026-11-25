"""Evaluate new questions with the v1 inference settings and two anonymous graders.

Resume by passing the same question file and log directory. The user supplies
an OpenRouter key as a file or OPENROUTER_API_KEY. All output stays in --log-dir.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import json
import os
from pathlib import Path
import random
import threading
import time

import evaluate
import crosscheck

def read_log(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--key-file", type=Path)
    parser.add_argument("--budget", type=float, default=7.5)
    parser.add_argument("--workers", type=int, default=44)
    args = parser.parse_args()
    evaluate.key = args.key_file.expanduser().read_text().strip() if args.key_file else os.environ["OPENROUTER_API_KEY"]
    evaluate.args = args
    args.log_dir.mkdir(parents=True, exist_ok=True)
    output = args.log_dir / "attempts.jsonl"
    verdicts = args.log_dir / "verdicts.jsonl"
    prior = read_log(output)
    judged = read_log(verdicts)
    saved = {r["tag"]: r for r in prior}
    judge_tags = {r["tag"] for r in judged}
    evaluate.spent = sum(r["cost"] for r in prior + judged)
    lock = threading.Lock()
    questions = json.loads(args.questions.read_text())
    model_ids = [m["id"] for m in evaluate.MODELS]
    selected = defaultdict(dict)
    errors = []
    pending_grades = []
    def append(path, row):
        with path.open("a") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def retry(op):
        for attempt in range(3):
            try:
                return op()
            except Exception as err:
                if attempt == 2 or "spending cap" in str(err):
                    raise
                time.sleep(1.5 ** attempt + random.random())

    def grade(q, rows):
        try:
            for judge in ("openai/gpt-6.2-sol", "anthropic/claude-sonnet-5.5"):
                # Each grading worker owns its model selection.
                for tag, _, op in crosscheck.make_task(q, rows, judge=judge):
                    if tag in judge_tags:
                        continue
                    record = dict(tag=tag, judge=judge, **retry(op))
                    with lock:
                        append(verdicts, record)
                        judge_tags.add(tag)
            print("Graded", q["id"], flush=True)
        except Exception as e:
            errors.append((q["id"],str(e)))

    def collect(job):
        q, model = job
        try:
            messages = [dict(role="system",content=evaluate.SYSTEM),dict(role="user",content=q["prompt"])]
            attempts = []
            for limit in (512, 4096, 16384):
                tag = evaluate.digest([messages,model,limit])
                r = saved.get(tag)
                if r is None:
                    out = retry(lambda: evaluate.chat(model,messages,limit,timeout=650 if limit>=4096 else 160))
                    r = dict(id=q["id"],model=model,tag=tag,limit=limit,**out)
                    with lock:
                        append(output,r)
                        saved[tag]=r
                attempts.append(r)
                if r["text"] and r["finish"]!="length":
                    break
            scored = dict(id=q["id"],model=model,text=r["text"],finish=r["finish"],
                          cost=sum(x["cost"] for x in attempts),
                          promptTokens=sum(x["promptTokens"] for x in attempts),
                          completionTokens=sum(x["completionTokens"] for x in attempts),
                          estimated=any(x["estimated"] for x in attempts),
                          attempts=[{k:x[k] for k in ("provider","returnedModel","finish","promptTokens","completionTokens","cost","date")} for x in attempts])
            with lock:
                selected[q["id"]][model]=scored
                if len(selected[q["id"]])==len(model_ids):
                    pending_grades.append(grader.submit(grade,q,list(selected[q["id"]].values())))
        except Exception as e:
            errors.append((q["id"],model,str(e)))

    with ThreadPoolExecutor(10) as grader, ThreadPoolExecutor(args.workers) as workers:
        list(workers.map(collect,[(q,m) for q in questions for m in model_ids]))
        for future in pending_grades: future.result()
    (args.log_dir/"selected.jsonl").write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for q in questions for r in selected[q["id"]].values()))
    print("Models x questions", len(model_ids),len(questions),"spend",round(evaluate.spent,5),"errors",errors,flush=True)
    if errors: raise SystemExit(1)

if __name__=="__main__":
    main()
