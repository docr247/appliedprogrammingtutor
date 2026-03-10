from __future__ import annotations

import ast
import json
import multiprocessing as mp
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

DATA_FILE = Path(__file__).parent / "data" / "clo_content.json"
ATTEMPT_TRACKER: dict[tuple[str, str, str], int] = {}

ALLOWED_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "print": print,
    "range": range,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def load_course_data() -> dict[str, Any]:
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def find_clo(course_data: dict[str, Any], clo_id: str) -> dict[str, Any] | None:
    return next((clo for clo in course_data["clos"] if clo["id"] == clo_id), None)


def _run_code_worker(
    output_queue: mp.Queue,
    student_code: str,
    function_name: str,
    tests: list[dict[str, Any]],
) -> None:
    try:
        tree = ast.parse(student_code)
        blocked_nodes = (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)
        if any(isinstance(node, blocked_nodes) for node in ast.walk(tree)):
            output_queue.put(
                {
                    "passed": False,
                    "error": "Imports and global statements are not allowed in this exercise.",
                }
            )
            return

        namespace: dict[str, Any] = {}
        exec(
            compile(tree, filename="<student_code>", mode="exec"),
            {"__builtins__": ALLOWED_BUILTINS},
            namespace,
        )

        if function_name not in namespace or not callable(namespace[function_name]):
            output_queue.put(
                {
                    "passed": False,
                    "error": f"Please define a callable function named '{function_name}'.",
                }
            )
            return

        candidate = namespace[function_name]
        for test in tests:
            args = test.get("args", [])
            expected = test.get("expected")
            actual = candidate(*args)
            if actual != expected:
                output_queue.put(
                    {
                        "passed": False,
                        "failed_input": args,
                        "actual": actual,
                    }
                )
                return

        output_queue.put({"passed": True})
    except SyntaxError as error:
        output_queue.put({"passed": False, "error": f"Syntax error: {error.msg} (line {error.lineno})"})
    except Exception as error:
        output_queue.put({"passed": False, "error": f"Runtime error: {type(error).__name__}: {error}"})


def evaluate_code(
    student_code: str,
    function_name: str,
    tests: list[dict[str, Any]],
    timeout_seconds: int = 2,
) -> dict[str, Any]:
    queue: mp.Queue = mp.Queue()
    process = mp.Process(
        target=_run_code_worker,
        args=(queue, student_code, function_name, tests),
        daemon=True,
    )
    process.start()
    process.join(timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join()
        return {
            "passed": False,
            "error": "Execution timed out. Re-check loops or recursion to avoid infinite execution.",
        }

    if queue.empty():
        return {"passed": False, "error": "Execution failed unexpectedly. Please try again."}

    return queue.get()


@app.route("/")
def home() -> str:
    return render_template("index.html")


@app.get("/api/clos")
def get_clos() -> Any:
    data = load_course_data()
    return jsonify(data)


@app.post("/api/assess/mcq")
def assess_mcq() -> Any:
    payload = request.get_json(silent=True) or {}
    clo_id = payload.get("clo_id")
    question_id = payload.get("question_id")
    selected_index = payload.get("selected_index")

    data = load_course_data()
    clo = find_clo(data, clo_id)
    if not clo:
        return jsonify({"error": "Invalid CLO ID."}), 400

    question = next((q for q in clo["mcq"] if q["id"] == question_id), None)
    if not question:
        return jsonify({"error": "Invalid question ID."}), 400

    is_correct = selected_index == question["answer_index"]
    message = "Correct. Great work!" if is_correct else "Not quite. Try reviewing the concept summary and attempt again."

    return jsonify(
        {
            "correct": is_correct,
            "message": message,
            "explanation": question["explanation"],
        }
    )


@app.post("/api/assess/code")
def assess_code() -> Any:
    payload = request.get_json(silent=True) or {}
    clo_id = payload.get("clo_id")
    exercise_id = payload.get("exercise_id")
    student_code = payload.get("code", "")
    session_id = request.headers.get("X-Session-Id", request.remote_addr or "anonymous")

    data = load_course_data()
    clo = find_clo(data, clo_id)
    if not clo:
        return jsonify({"error": "Invalid CLO ID."}), 400

    exercise = next((ex for ex in clo["coding_exercises"] if ex["id"] == exercise_id), None)
    if not exercise:
        return jsonify({"error": "Invalid exercise ID."}), 400

    key = (session_id, clo_id, exercise_id)
    ATTEMPT_TRACKER[key] = ATTEMPT_TRACKER.get(key, 0) + 1
    attempt_count = ATTEMPT_TRACKER[key]

    result = evaluate_code(student_code, exercise["function_name"], exercise["tests"])
    if result["passed"]:
        return jsonify(
            {
                "passed": True,
                "message": "Excellent! Your solution passes the checks.",
                "attempts": attempt_count,
                "hint": None,
            }
        )

    hint_index = min(attempt_count - 1, len(exercise["hints"]) - 1)
    hint = exercise["hints"][hint_index]

    feedback_parts = ["Your code is close, but it does not meet all required behaviors yet."]
    if "error" in result:
        feedback_parts.append(result["error"])
    elif "failed_input" in result:
        feedback_parts.append(
            f"Check behavior for input {result['failed_input']}. Current output was {result.get('actual')}"
        )

    return jsonify(
        {
            "passed": False,
            "message": " ".join(feedback_parts),
            "attempts": attempt_count,
            "hint": hint,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
