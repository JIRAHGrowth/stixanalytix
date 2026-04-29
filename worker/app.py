"""
StixAnalytix video worker.

Phase 1: pulls a video_jobs row, downloads the source video, runs Gemini against
prompts/goals.md (with team-colour variables substituted in), writes structured
output to gemini_output, and parks the job at status='review_needed' for the
coach to review and publish via the dashboard.

Deploy:  modal deploy worker/app.py
Invoke:  modal run worker/app.py::process --job-id <uuid>
HTTP:    POST <trigger-url> with {"job_id": "<uuid>"} and header
         X-Trigger-Secret: $MODAL_TRIGGER_SECRET. Returns immediately after
         spawning; the worker runs in the background.
"""

import os
import modal

IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "google-generativeai>=0.8.0",
        "supabase>=2.9.0",
        "requests>=2.32.0",
        "fastapi[standard]>=0.115.0",
    )
    .add_local_dir("prompts", remote_path="/root/prompts")
)

app = modal.App("stixanalytix-worker")
secret = modal.Secret.from_name("stix-env")


RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "goals": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "timestamp_seconds": {"type": "INTEGER"},
                    "match_clock": {"type": "STRING"},
                    "scoring_team": {"type": "STRING"},
                    "conceding_team": {"type": "STRING"},
                    "scoreboard_before": {"type": "STRING"},
                    "scoreboard_after": {"type": "STRING"},
                    "attack_type": {"type": "STRING"},
                    "buildup": {"type": "STRING"},
                    "shot_type": {"type": "STRING"},
                    "shot_location": {"type": "STRING"},
                    "goal_placement_height": {"type": "STRING"},
                    "goal_placement_side": {"type": "STRING"},
                    "gk_observations": {"type": "STRING"},
                    "confidence": {"type": "STRING"},
                },
                "required": [
                    "timestamp_seconds", "match_clock", "scoring_team",
                    "conceding_team", "scoreboard_before", "scoreboard_after",
                    "attack_type", "buildup", "shot_type", "shot_location",
                    "goal_placement_height", "goal_placement_side",
                    "gk_observations", "confidence",
                ],
            },
        }
    },
    "required": ["goals"],
}


def _render_prompt(template: str, vars: dict) -> str:
    out = template
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", str(v or "(unspecified)"))
    return out


@app.function(image=IMAGE, secrets=[secret], timeout=1800)
def process(job_id: str) -> dict:
    from datetime import datetime, timezone
    from pathlib import Path
    import tempfile
    import time

    import requests
    from supabase import create_client
    import google.generativeai as genai

    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    if job["status"] in ("published", "review_needed"):
        return {"job_id": job_id, "skipped": f"already {job['status']}"}
    if job["status"] == "analyzing":
        return {"job_id": job_id, "skipped": "already analyzing"}

    now = lambda: datetime.now(timezone.utc).isoformat()

    sb.table("video_jobs").update({
        "status": "analyzing",
        "started_at": now(),
    }).eq("id", job_id).execute()

    try:
        meta = job.get("match_metadata") or {}
        prompt_template = Path("/root/prompts/goals.md").read_text(encoding="utf-8")
        prompt = _render_prompt(prompt_template, {
            "my_team_color": meta.get("my_team_color"),
            "my_keeper_color": meta.get("my_keeper_color"),
            "opponent_color": meta.get("opponent_color"),
        })

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            r = requests.get(job["video_url"], stream=True, timeout=600)
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
            video_path = f.name

        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        uploaded = genai.upload_file(path=video_path, mime_type="video/mp4")
        while uploaded.state.name == "PROCESSING":
            time.sleep(5)
            uploaded = genai.get_file(uploaded.name)
        if uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file ended in state {uploaded.state.name}")

        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
        model = genai.GenerativeModel(
            model_name,
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": RESPONSE_SCHEMA,
            },
        )
        resp = model.generate_content([uploaded, prompt])

        import json
        try:
            parsed = json.loads(resp.text)
        except json.JSONDecodeError:
            parsed = None

        usage = getattr(resp, "usage_metadata", None)
        usage_dict = None
        if usage is not None:
            usage_dict = {
                "total_token_count": getattr(usage, "total_token_count", None),
                "prompt_token_count": getattr(usage, "prompt_token_count", None),
                "candidates_token_count": getattr(usage, "candidates_token_count", None),
            }

        sb.table("video_jobs").update({
            "status": "review_needed",
            "gemini_output": {
                "model": model_name,
                "raw": resp.text,
                "parsed": parsed,
                "usage": usage_dict,
            },
            "finished_at": now(),
        }).eq("id", job_id).execute()

        return {
            "job_id": job_id,
            "status": "review_needed",
            "goals_detected": len((parsed or {}).get("goals", [])) if parsed else None,
        }

    except Exception as e:
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": str(e)[:4000],
            "retry_count": (job.get("retry_count") or 0) + 1,
            "finished_at": now(),
        }).eq("id", job_id).execute()
        raise


from fastapi import Header, HTTPException


@app.function(image=IMAGE, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def trigger(payload: dict, x_trigger_secret: str = Header(default="")):
    """HTTP entry point used by the Next.js API route to spawn `process`.

    Expects: POST {"job_id": "<uuid>"} with header X-Trigger-Secret matching
    MODAL_TRIGGER_SECRET. Spawns the worker and returns immediately so the
    caller doesn't block on the 15-30 minute analysis.
    """
    expected = os.environ.get("MODAL_TRIGGER_SECRET", "")
    if not expected or x_trigger_secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    job_id = (payload or {}).get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id required")
    call = process.spawn(job_id)
    return {"job_id": job_id, "modal_call_id": call.object_id}
