from __future__ import annotations

import ast
import json
import multiprocessing as mp
import os
import re
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, render_template, request, send_from_directory, url_for

app = Flask(__name__)

DATA_FILE = Path(__file__).parent / "data" / "clo_content.json"
SLIDES_DIR = Path(__file__).parent / "slides"
ATTEMPT_TRACKER: dict[tuple[str, str, str], int] = {}
APP_VERSION = "20260310-2"

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


def get_clo_slides(clo_id: str) -> list[dict[str, str]]:
    clo_slides_dir = SLIDES_DIR / clo_id
    if not clo_slides_dir.exists() or not clo_slides_dir.is_dir():
        return []

    slide_files = sorted(clo_slides_dir.glob("*.pdf"), key=lambda file: file.name.lower())
    return [
        {
            "title": slide_file.stem.replace("_", " "),
            "url": url_for("get_slide_file", clo_id=clo_id, filename=slide_file.name),
        }
        for slide_file in slide_files
    ]


def simplify_function_code_header(code: str, function_name: str | None) -> str:
    if not code:
        return code

    name_pattern = re.escape(function_name) if function_name else r"[A-Za-z_][A-Za-z0-9_]*"
    match = re.search(rf"^\s*def\s+({name_pattern})\s*\(([^)]*)\)\s*:", code, re.MULTILINE)
    if not match:
        fallback = re.search(r"^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:", code, re.MULTILINE)
        if not fallback:
            fallback_name = function_name or "solution"
            return f"def {fallback_name}():\n    pass"
        match = fallback

    lines = code.split("\n")
    definition_line_index = code[: match.start()].count("\n")
    definition_line = lines[definition_line_index] if definition_line_index < len(lines) else ""
    function_indent = len(definition_line) - len(definition_line.lstrip())

    raw_params = match.group(2) if match.lastindex and match.lastindex >= 2 else ""
    params = ", ".join(
        param.strip()
        for param in raw_params.split(",")
        if param.strip() and param.strip() not in {"self", "cls"}
    )

    normalized_function_name = function_name or match.group(1)

    block_end = len(lines)
    for index in range(definition_line_index + 1, len(lines)):
        current_line = lines[index]
        if not current_line.strip():
            continue
        current_indent = len(current_line) - len(current_line.lstrip())
        if current_indent <= function_indent:
            block_end = index
            break

    body_lines = lines[definition_line_index + 1 : block_end]
    non_empty_indents = [
        len(line) - len(line.lstrip())
        for line in body_lines
        if line.strip() and (len(line) - len(line.lstrip())) > function_indent
    ]

    dedent_amount = min(non_empty_indents) if non_empty_indents else function_indent + 4
    normalized_body_lines: list[str] = []
    for line in body_lines:
        if not line.strip():
            normalized_body_lines.append("")
            continue
        normalized_body_lines.append(line[dedent_amount:])

    normalized_body = "\n".join(normalized_body_lines).strip("\n")
    if not normalized_body.strip():
        normalized_body = "    pass"

    return f"def {normalized_function_name}({params}):\n{normalized_body}"


def simplify_exercise_prompt(prompt: str, function_name: str | None) -> str:
    if not prompt:
        return prompt

    cleaned = prompt
    cleaned = re.sub(r"\b(class\s+solution|solution\s+class)\b", "function", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bself\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if function_name and "write a function" not in cleaned.lower() and "function" not in cleaned.lower():
        cleaned = f"Write a function {function_name}(...). {cleaned}"

    return cleaned


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
    return render_template("index.html", app_version=APP_VERSION)


@app.get("/api/clos")
def get_clos() -> Any:
    data = load_course_data()
    for clo in data.get("clos", []):
        clo_id = clo.get("id")
        clo["slides"] = get_clo_slides(clo_id) if clo_id else []
        for exercise in clo.get("coding_exercises", []):
            function_name = exercise.get("function_name")
            exercise["prompt"] = simplify_exercise_prompt(exercise.get("prompt", ""), function_name)
            exercise["starter_code"] = simplify_function_code_header(
                exercise.get("starter_code", ""), function_name
            )
            exercise["solution_code"] = simplify_function_code_header(
                exercise.get("solution_code", ""), function_name
            )
    return jsonify(data)


@app.get("/slides/<clo_id>/<path:filename>")
def get_slide_file(clo_id: str, filename: str) -> Any:
    if Path(filename).suffix.lower() != ".pdf":
        abort(404)

    clo_slides_dir = SLIDES_DIR / clo_id
    if not clo_slides_dir.exists() or not clo_slides_dir.is_dir():
        abort(404)

    return send_from_directory(clo_slides_dir, filename)


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

    selected_option_text = (
        question["options"][selected_index]
        if isinstance(selected_index, int) and 0 <= selected_index < len(question["options"])
        else ""
    )
    correct_option_text = question["options"][question["answer_index"]]

    return jsonify(
        {
            "correct": is_correct,
            "message": message,
            "explanation": question["explanation"],
            "selected_option_text": selected_option_text,
            "correct_option_text": correct_option_text,
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
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
