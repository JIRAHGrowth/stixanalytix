"""
StixAnalytix video worker.

Phase 0 skeleton: one Modal function `process` that picks up a video_jobs row,
downloads the source video, runs Gemini, writes raw output back. Idempotent on
video_jobs.id — re-invoking is safe.

Deploy:  modal deploy worker/app.py
Invoke:  modal run worker/app.py::process --job-id <uuid>
"""

import os
import modal

IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "google-genai>=0.3.0",
        "supabase>=2.9.0",
        "requests>=2.32.0",
    )
)

app = modal.App("stixanalytix-worker")
secret = modal.Secret.from_name("stix-env")


@app.function(image=IMAGE, secrets=[secret], timeout=1800)
def process(job_id: str) -> dict:
    from datetime import datetime, timezone
    import tempfile
    import time

    import requests
    from supabase import create_client
    from google import genai

    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    if job["status"] == "done":
        return {"job_id": job_id, "skipped": "already done"}
    if job["status"] == "running":
        return {"job_id": job_id, "skipped": "already running"}

    now = lambda: datetime.now(timezone.utc).isoformat()

    sb.table("video_jobs").update({
        "status": "running",
        "started_at": now(),
    }).eq("id", job_id).execute()

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            r = requests.get(job["video_url"], stream=True, timeout=600)
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
            video_path = f.name

        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        uploaded = client.files.upload(file=video_path)
        while uploaded.state.name == "PROCESSING":
            time.sleep(2)
            uploaded = client.files.get(name=uploaded.name)
        if uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file upload ended in state {uploaded.state.name}")

        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        resp = client.models.generate_content(
            model=model,
            contents=[uploaded, PROMPT_PHASE_0],
        )

        sb.table("video_jobs").update({
            "status": "done",
            "gemini_output": {"raw": resp.text, "model": model},
            "finished_at": now(),
        }).eq("id", job_id).execute()

        return {"job_id": job_id, "status": "done", "chars": len(resp.text or "")}

    except Exception as e:
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": str(e)[:4000],
            "retry_count": job["retry_count"] + 1,
            "finished_at": now(),
        }).eq("id", job_id).execute()
        raise


PROMPT_PHASE_0 = """You are watching a soccer match. This is a Phase 0 pipeline test — we are wiring infrastructure, not grading analysis yet.

Return ONLY a JSON object with this exact shape:

{
  "duration_seconds_estimate": <int>,
  "goals_observed": [
    {"timestamp_seconds": <int>, "scoring_team": "<color or 'unknown'>", "description": "<one sentence>"}
  ],
  "confidence_notes": "<what you could see clearly, what you could not, any camera issues>"
}

No prose outside the JSON. If you observed zero goals, return an empty list.
"""
