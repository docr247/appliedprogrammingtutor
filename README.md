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

## Deploy to Render (Recommended)

This repo is now deployment-ready for Render.

### 1) Push code to GitHub

Render deploys directly from your GitHub repository.

### 2) Create a new Web Service on Render

- In Render dashboard: **New +** -> **Web Service**
- Connect this repo
- Render can auto-detect settings from `render.yaml`

If entering settings manually:

- **Environment**: Python
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app --workers 2 --threads 4 --timeout 120`

### 3) Environment variables

Set in Render:

- `FLASK_DEBUG=false`

`PORT` is provided automatically by Render.

### 4) Deploy

Trigger deploy and wait for the service URL, for example:

- `https://applied-programming-tutor.onrender.com`

## Connect Your Cloudflare Domain

After Render is live:

1. In Render, add your custom domain (for example `tutor.yourdomain.com`).
2. In Cloudflare DNS, create a `CNAME` record from `tutor` to your Render hostname.
3. Keep SSL/TLS enabled in both Render and Cloudflare.

## Future Updates Workflow

For improvements:

1. Make changes locally.
2. Commit and push to `main`.
3. Render auto-deploys the latest commit.

This keeps deployment simple and repeatable.

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
