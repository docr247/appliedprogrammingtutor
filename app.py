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

CODING_ANALYSIS_BANK: dict[str, list[dict[str, Any]]] = {
    "CLO1": [
        {
            "id": "CLO1-A1",
            "title": "Predict printed values",
            "snippet": "x = 3\ny = 5\nprint(x + y)\nprint(x * y)",
            "prompt": "What will this code print? Write the output line by line.",
            "accepted_answers": ["8\n15", "8 15"],
            "keywords": ["8", "15"],
            "hint": "There are two print statements, so there should be two output values.",
        },
        {
            "id": "CLO1-A2",
            "title": "Simple subtraction output",
            "snippet": "a = 12\nb = 4\nprint(a - b)",
            "prompt": "What is the expected output?",
            "accepted_answers": ["8"],
            "keywords": ["8"],
            "hint": "Subtract 4 from 12.",
        },
        {
            "id": "CLO1-A3",
            "title": "Decision branch trace",
            "snippet": "value = -1\nif value > 0:\n    print('positive')\nelse:\n    print('not positive')",
            "prompt": "What will be printed?",
            "accepted_answers": ["not positive"],
            "keywords": ["not", "positive"],
            "hint": "Check the condition value > 0 for value = -1.",
        },
        {
            "id": "CLO1-A4",
            "title": "Boolean comparison",
            "snippet": "print(7 > 3)",
            "prompt": "Write the program output.",
            "accepted_answers": ["true", "True"],
            "keywords": ["true"],
            "hint": "7 is greater than 3.",
        },
        {
            "id": "CLO1-A5",
            "title": "String repetition",
            "snippet": "text = 'Hi'\nprint(text * 3)",
            "prompt": "What output is printed?",
            "accepted_answers": ["hihihi", "HiHiHi"],
            "keywords": ["hihihi"],
            "hint": "Multiplying a string repeats it.",
        },
        {
            "id": "CLO1-A6",
            "title": "Input and type",
            "snippet": "n = 5\nprint(type(n).__name__)",
            "prompt": "What is printed to the console?",
            "accepted_answers": ["int"],
            "keywords": ["int"],
            "hint": "n is an integer literal.",
        },
        {
            "id": "CLO1-A7",
            "title": "Sequence flow",
            "snippet": "x = 2\nx = x + 3\nprint(x)",
            "prompt": "What is the final output?",
            "accepted_answers": ["5"],
            "keywords": ["5"],
            "hint": "Track x after each line in order.",
        },
        {
            "id": "CLO1-A8",
            "title": "Equality check",
            "snippet": "print(4 == 4)\nprint(4 != 4)",
            "prompt": "Write both output lines.",
            "accepted_answers": ["true\nfalse", "True\nFalse", "true false", "True False"],
            "keywords": ["true", "false"],
            "hint": "First check is equality, second is inequality.",
        }
    ],
    "CLO2": [
        {
            "id": "CLO2-A1",
            "title": "Operator precedence check",
            "snippet": "a = 10\nb = 3\nprint(a // b)\nprint(a % b)",
            "prompt": "What is the expected output of this snippet?", 
            "accepted_answers": ["3\n1", "3 1"],
            "keywords": ["3", "1"],
            "hint": "The first line is integer division and the second line is remainder.",
        },
        {
            "id": "CLO2-A2",
            "title": "Order of operations",
            "snippet": "print(2 + 3 * 4)",
            "prompt": "What will this print?",
            "accepted_answers": ["14"],
            "keywords": ["14"],
            "hint": "Multiplication happens before addition.",
        },
        {
            "id": "CLO2-A3",
            "title": "Parentheses effect",
            "snippet": "print((2 + 3) * 4)",
            "prompt": "What output is produced?",
            "accepted_answers": ["20"],
            "keywords": ["20"],
            "hint": "Parentheses force addition first.",
        },
        {
            "id": "CLO2-A4",
            "title": "Floor division with negatives",
            "snippet": "print(-7 // 3)",
            "prompt": "State the output.",
            "accepted_answers": ["-3"],
            "keywords": ["3"],
            "hint": "Floor division rounds down, not toward zero.",
        },
        {
            "id": "CLO2-A5",
            "title": "Modulo sign behavior",
            "snippet": "print(-7 % 3)",
            "prompt": "What does this print?",
            "accepted_answers": ["2"],
            "keywords": ["2"],
            "hint": "Python's modulo result keeps the divisor sign.",
        },
        {
            "id": "CLO2-A6",
            "title": "Mixed numeric types",
            "snippet": "x = 5\ny = 2\nprint(x / y)",
            "prompt": "Write the expected output.",
            "accepted_answers": ["2.5"],
            "keywords": ["25"],
            "hint": "Regular division returns float.",
        },
        {
            "id": "CLO2-A7",
            "title": "Absolute value",
            "snippet": "value = -9\nprint(abs(value))",
            "prompt": "What is printed?",
            "accepted_answers": ["9"],
            "keywords": ["9"],
            "hint": "abs gives non-negative magnitude.",
        },
        {
            "id": "CLO2-A8",
            "title": "Power operator",
            "snippet": "print(2 ** 5)",
            "prompt": "What output is expected?",
            "accepted_answers": ["32"],
            "keywords": ["32"],
            "hint": "** is exponentiation in Python.",
        }
    ],
    "CLO3": [
        {
            "id": "CLO3-A1",
            "title": "Conditional output tracing",
            "snippet": "n = 7\nif n % 2 == 0:\n    print('even')\nelse:\n    print('odd')",
            "prompt": "What will be printed when this code runs?",
            "accepted_answers": ["odd"],
            "keywords": ["odd"],
            "hint": "Check whether 7 is divisible by 2.",
        },
        {
            "id": "CLO3-A2",
            "title": "List indexing",
            "snippet": "nums = [10, 20, 30]\nprint(nums[1])",
            "prompt": "What will this print?",
            "accepted_answers": ["20"],
            "keywords": ["20"],
            "hint": "List index starts at 0.",
        },
        {
            "id": "CLO3-A3",
            "title": "Negative indexing",
            "snippet": "letters = ['a', 'b', 'c']\nprint(letters[-1])",
            "prompt": "State the output.",
            "accepted_answers": ["c"],
            "keywords": ["c"],
            "hint": "-1 refers to the last element.",
        },
        {
            "id": "CLO3-A4",
            "title": "List append and length",
            "snippet": "items = [1, 2]\nitems.append(3)\nprint(len(items))",
            "prompt": "What is printed?",
            "accepted_answers": ["3"],
            "keywords": ["3"],
            "hint": "append adds one new element.",
        },
        {
            "id": "CLO3-A5",
            "title": "Tuple access",
            "snippet": "point = (4, 7)\nprint(point[0])",
            "prompt": "Write the expected output.",
            "accepted_answers": ["4"],
            "keywords": ["4"],
            "hint": "Index 0 is the first item.",
        },
        {
            "id": "CLO3-A6",
            "title": "Dictionary lookup",
            "snippet": "student = {'name': 'Ali', 'score': 85}\nprint(student['score'])",
            "prompt": "What output appears?",
            "accepted_answers": ["85"],
            "keywords": ["85"],
            "hint": "Use the value mapped to key 'score'.",
        },
        {
            "id": "CLO3-A7",
            "title": "Membership test",
            "snippet": "colors = ['red', 'blue']\nprint('green' in colors)",
            "prompt": "What is printed?",
            "accepted_answers": ["false", "False"],
            "keywords": ["false"],
            "hint": "green is not in the list.",
        },
        {
            "id": "CLO3-A8",
            "title": "String slicing",
            "snippet": "text = 'Python'\nprint(text[0:3])",
            "prompt": "What output is produced?",
            "accepted_answers": ["pyt", "Pyt"],
            "keywords": ["pyt"],
            "hint": "Slice [0:3] includes indices 0,1,2.",
        }
    ],
    "CLO4": [
        {
            "id": "CLO4-A1",
            "title": "Loop accumulation",
            "snippet": "total = 0\nfor value in [1, 2, 3, 4]:\n    total += value\nprint(total)",
            "prompt": "State the final output produced by this code.",
            "accepted_answers": ["10"],
            "keywords": ["10"],
            "hint": "The loop adds all numbers in the list into total.",
        },
        {
            "id": "CLO4-A2",
            "title": "For loop range",
            "snippet": "for i in range(3):\n    print(i)",
            "prompt": "Write the printed output lines in order.",
            "accepted_answers": ["0\n1\n2", "0 1 2"],
            "keywords": ["0", "1", "2"],
            "hint": "range(3) gives 0 up to 2.",
        },
        {
            "id": "CLO4-A3",
            "title": "While loop countdown",
            "snippet": "n = 3\nwhile n > 0:\n    print(n)\n    n -= 1",
            "prompt": "What output appears?",
            "accepted_answers": ["3\n2\n1", "3 2 1"],
            "keywords": ["3", "2", "1"],
            "hint": "n decreases by 1 each iteration until it reaches 0.",
        },
        {
            "id": "CLO4-A4",
            "title": "Break behavior",
            "snippet": "for i in range(5):\n    if i == 2:\n        break\n    print(i)",
            "prompt": "List the output lines.",
            "accepted_answers": ["0\n1", "0 1"],
            "keywords": ["0", "1"],
            "hint": "Loop stops when i becomes 2.",
        },
        {
            "id": "CLO4-A5",
            "title": "Continue behavior",
            "snippet": "for i in range(4):\n    if i == 2:\n        continue\n    print(i)",
            "prompt": "What does this print?",
            "accepted_answers": ["0\n1\n3", "0 1 3"],
            "keywords": ["0", "1", "3"],
            "hint": "continue skips printing only for i == 2.",
        },
        {
            "id": "CLO4-A6",
            "title": "Nested loop counter",
            "snippet": "count = 0\nfor i in range(2):\n    for j in range(2):\n        count += 1\nprint(count)",
            "prompt": "What is the final output?",
            "accepted_answers": ["4"],
            "keywords": ["4"],
            "hint": "Inner loop runs 2 times for each outer iteration.",
        },
        {
            "id": "CLO4-A7",
            "title": "Sum in loop",
            "snippet": "total = 0\nfor n in [2, 4, 6]:\n    total += n\nprint(total)",
            "prompt": "State the output.",
            "accepted_answers": ["12"],
            "keywords": ["12"],
            "hint": "Add 2 + 4 + 6.",
        },
        {
            "id": "CLO4-A8",
            "title": "Loop with condition",
            "snippet": "for n in [1, 2, 3, 4]:\n    if n % 2 == 0:\n        print(n)",
            "prompt": "Write the output lines.",
            "accepted_answers": ["2\n4", "2 4"],
            "keywords": ["2", "4"],
            "hint": "Only even numbers satisfy n % 2 == 0.",
        }
    ],
    "CLO5": [
        {
            "id": "CLO5-A1",
            "title": "Function call output",
            "snippet": "def greet(name):\n    return f'Hello {name}'\n\nprint(greet('Sara'))",
            "prompt": "What output does this program produce?",
            "accepted_answers": ["hello sara", "Hello Sara"],
            "keywords": ["hello", "sara"],
            "hint": "The function returns a string and print displays it.",
        },
        {
            "id": "CLO5-A2",
            "title": "Function with arithmetic",
            "snippet": "def add(a, b):\n    return a + b\n\nprint(add(4, 6))",
            "prompt": "What is printed?",
            "accepted_answers": ["10"],
            "keywords": ["10"],
            "hint": "The function returns a+b.",
        },
        {
            "id": "CLO5-A3",
            "title": "Default argument",
            "snippet": "def greet(name='Student'):\n    return f'Hi {name}'\n\nprint(greet())",
            "prompt": "State the output.",
            "accepted_answers": ["hi student", "Hi Student"],
            "keywords": ["hi", "student"],
            "hint": "No argument means the default value is used.",
        },
        {
            "id": "CLO5-A4",
            "title": "String upper method",
            "snippet": "word = 'python'\nprint(word.upper())",
            "prompt": "What does this print?",
            "accepted_answers": ["PYTHON", "python"],
            "keywords": ["python"],
            "hint": "upper converts letters to uppercase.",
        },
        {
            "id": "CLO5-A5",
            "title": "Split and length",
            "snippet": "text = 'one two three'\nparts = text.split()\nprint(len(parts))",
            "prompt": "Write the expected output.",
            "accepted_answers": ["3"],
            "keywords": ["3"],
            "hint": "split() creates a list of words.",
        },
        {
            "id": "CLO5-A6",
            "title": "Simple class method",
            "snippet": "class Counter:\n    def __init__(self):\n        self.value = 1\n\n    def inc(self):\n        self.value += 1\n\nc = Counter()\nc.inc()\nprint(c.value)",
            "prompt": "What output is produced?",
            "accepted_answers": ["2"],
            "keywords": ["2"],
            "hint": "value starts at 1 and inc adds 1.",
        },
        {
            "id": "CLO5-A7",
            "title": "Class attribute usage",
            "snippet": "class Box:\n    def __init__(self, w, h):\n        self.w = w\n        self.h = h\n\n    def area(self):\n        return self.w * self.h\n\nb = Box(3, 5)\nprint(b.area())",
            "prompt": "What does this code print?",
            "accepted_answers": ["15"],
            "keywords": ["15"],
            "hint": "area multiplies width by height.",
        },
        {
            "id": "CLO5-A8",
            "title": "Method returning text",
            "snippet": "class Person:\n    def __init__(self, name):\n        self.name = name\n\n    def intro(self):\n        return f'I am {self.name}'\n\np = Person('Aisha')\nprint(p.intro())",
            "prompt": "Write the exact output.",
            "accepted_answers": ["i am aisha", "I am Aisha"],
            "keywords": ["am", "aisha"],
            "hint": "intro returns a formatted sentence with the given name.",
        }
    ],
}

DIFFICULTY_ORDER = ["easy", "medium", "hard"]

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

    dedented_body = "\n".join(normalized_body_lines).strip("\n")
    if not dedented_body.strip():
        dedented_body = "pass"

    indented_body = "\n".join(
        f"    {line}" if line else ""
        for line in dedented_body.split("\n")
    )

    return f"def {normalized_function_name}({params}):\n{indented_body}"


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


def normalize_written_answer(value: str) -> str:
    collapsed = re.sub(r"\s+", " ", value.strip().lower())
    return re.sub(r"[^a-z0-9\n ]", "", collapsed)


def normalize_multiline_answer(value: str) -> str:
    lines = [line.strip().lower() for line in value.strip().splitlines() if line.strip()]
    return "\n".join(lines)


def get_analysis_difficulty(item: dict[str, Any], index: int) -> str:
    explicit = str(item.get("difficulty", "")).strip().lower()
    if explicit in DIFFICULTY_ORDER:
        return explicit
    if index < 3:
        return "easy"
    if index < 6:
        return "medium"
    return "hard"


def get_public_coding_analysis(clo_id: str) -> list[dict[str, Any]]:
    items = CODING_ANALYSIS_BANK.get(clo_id, [])
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "snippet": item["snippet"],
            "prompt": item["prompt"],
            "hint": item.get("hint"),
            "difficulty": get_analysis_difficulty(item, index),
        }
        for index, item in enumerate(items)
    ]


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
        clo["coding_analysis"] = get_public_coding_analysis(clo_id) if clo_id else []
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


@app.post("/api/assess/code-analysis")
def assess_code_analysis() -> Any:
    payload = request.get_json(silent=True) or {}
    clo_id = payload.get("clo_id")
    question_id = payload.get("question_id")
    answer_text = str(payload.get("answer", "")).strip()
    session_id = request.headers.get("X-Session-Id", request.remote_addr or "anonymous")

    if not clo_id or not question_id:
        return jsonify({"error": "Missing CLO or question details."}), 400

    question = next(
        (item for item in CODING_ANALYSIS_BANK.get(clo_id, []) if item.get("id") == question_id),
        None,
    )
    if not question:
        return jsonify({"error": "Invalid coding analysis question."}), 400

    if not answer_text:
        return jsonify({"error": "Please provide your written answer."}), 400

    key = (session_id, clo_id, f"analysis:{question_id}")
    ATTEMPT_TRACKER[key] = ATTEMPT_TRACKER.get(key, 0) + 1
    attempt_count = ATTEMPT_TRACKER[key]

    normalized_line_answer = normalize_multiline_answer(answer_text)
    normalized_accepted_lines = {
        normalize_multiline_answer(accepted) for accepted in question.get("accepted_answers", [])
    }
    is_exact_match = normalized_line_answer in normalized_accepted_lines

    normalized_written_answer = normalize_written_answer(answer_text)
    required_keywords = [word.lower() for word in question.get("keywords", [])]
    has_keywords = all(keyword in normalized_written_answer for keyword in required_keywords)
    is_correct = is_exact_match or has_keywords

    if is_correct:
        return jsonify(
            {
                "correct": True,
                "attempts": attempt_count,
                "message": "Good analysis. Your expected output is correct.",
                "hint": None,
            }
        )

    return jsonify(
        {
            "correct": False,
            "attempts": attempt_count,
            "message": "Not quite yet. Re-check the code flow and output order.",
            "hint": question.get("hint"),
        }
    )


@app.post("/api/assess/code-analysis/reveal")
def reveal_code_analysis_answer() -> Any:
    payload = request.get_json(silent=True) or {}
    clo_id = payload.get("clo_id")
    question_id = payload.get("question_id")
    session_id = request.headers.get("X-Session-Id", request.remote_addr or "anonymous")

    if not clo_id or not question_id:
        return jsonify({"error": "Missing CLO or question details."}), 400

    question = next(
        (item for item in CODING_ANALYSIS_BANK.get(clo_id, []) if item.get("id") == question_id),
        None,
    )
    if not question:
        return jsonify({"error": "Invalid coding analysis question."}), 400

    key = (session_id, clo_id, f"analysis:{question_id}")
    attempt_count = ATTEMPT_TRACKER.get(key, 0)
    if attempt_count < 5:
        return jsonify({"error": "Answer reveal is available after 5 attempts.", "attempts": attempt_count}), 403

    accepted_answers = question.get("accepted_answers", [])
    canonical_answer = accepted_answers[0] if accepted_answers else ""

    return jsonify(
        {
            "answer": canonical_answer,
            "attempts": attempt_count,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
