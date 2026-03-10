# Applied Programming Tutor (CLO 1–5)

A starter AI-assisted learning web app for your Applied Programming with Python course.

## Features

- CLO 1–5 summary view (from your slide content)
- MCQ assessments per CLO with immediate feedback
- Coding exercises per CLO with automatic checking
- Guided hints that increase by attempt count (without revealing full answers)

## Project Structure

- `app.py` - Flask backend and assessment APIs
- `data/clo_content.json` - CLO summaries, MCQs, coding exercises
- `templates/index.html` - UI structure
- `static/styles.css` - UI styling
- `static/app.js` - Frontend behavior

## Run Locally

```bash
cd /Users/ravisuppiah/Dropbox/AppliedProgrammingTutor
/opt/homebrew/bin/python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python app.py
```

Open: http://127.0.0.1:5000

## Customize with Your Material

Edit `data/clo_content.json`:

- Replace `summary` items with your slide summary bullets for each CLO
- Update `mcq` question banks and explanations
- Add more `coding_exercises` with:
  - `prompt`
  - `starter_code`
  - `function_name`
  - progressive `hints`
  - hidden `tests`

## Design Note

The coding checker intentionally provides behavior-based feedback + hints and does not return full model answers.
