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


def _build_calibration_preamble(sb, coach_id: str, limit: int = 30) -> str:
    """D11: per-coach calibration from past corrections.

    Pulls the coach's most recent N correction rows, buckets by correction_type,
    and emits a compact natural-language preamble that nudges Gemini toward
    this coach's observed judgment patterns. Returns empty string if no
    corrections exist yet (first-match coaches).

    Cheap by design: a few hundred tokens at most, regardless of how many
    corrections are stored. The model pattern-matches the bullets itself.
    """
    try:
        res = sb.table("coach_corrections").select(
            "correction_type, gemini_value, coach_value, match_metadata, created_at"
        ).eq("coach_id", coach_id).order("created_at", desc=True).limit(limit).execute()
        rows = res.data or []
    except Exception as e:
        print(f"[calibration] could not fetch corrections: {e}")
        return ""

    if not rows:
        return ""

    # Bucket by type
    by_type = {}
    for r in rows:
        by_type.setdefault(r["correction_type"], []).append(r)

    n_total = len(rows)
    n_kept = len(by_type.get("kept_as_is", []))
    n_false_pos = len(by_type.get("false_positive", []))
    n_missed = len(by_type.get("missed_goal", []))
    n_team_flipped = len(by_type.get("wrong_team", []))
    n_zone_changed = len(by_type.get("wrong_zone", []))
    n_attack_changed = len(by_type.get("wrong_attack_type", []))
    n_shot_changed = len(by_type.get("wrong_shot_type", []))

    lines = [
        "# CALIBRATION FROM THIS COACH",
        "",
        f"This coach has reviewed {n_total} of your past goal candidates across previous matches.",
        f"They kept {n_kept} as-is, rejected {n_false_pos} as false positives, "
        f"added {n_missed} goals you missed, "
        f"flipped {n_team_flipped} on scoring team, and edited fields on "
        f"{n_zone_changed + n_attack_changed + n_shot_changed} (zone/attack/shot type).",
        "",
        "Apply this calibration:",
        "",
    ]

    # False positives — what kind of events does this coach NOT consider goals?
    if n_false_pos:
        examples = by_type["false_positive"][:5]
        attack_types = [str((e.get("gemini_value") or {}).get("attack_type", "")).lower() for e in examples]
        shot_types = [str((e.get("gemini_value") or {}).get("shot_type", "")).lower() for e in examples]
        rebound_count = sum(1 for s in shot_types if "rebound" in s)
        lines.append(f"- You over-detect ({n_false_pos} false-positives in last {n_total}). " +
                     ("Many were rebounds (rebound count: " + str(rebound_count) + "). Treat rebound shots as continuations of one play, not new goals." if rebound_count >= 2 else
                      "Be more conservative — require clear celebration AND restart, not just ball-in-net frames."))

    # Missed goals — coach added goals you didn't see
    if n_missed:
        examples = by_type["missed_goal"][:5]
        opp_misses = sum(1 for e in examples if (e.get("coach_value") or {}).get("scored_by_us") is False)
        my_misses = sum(1 for e in examples if (e.get("coach_value") or {}).get("scored_by_us") is True)
        if opp_misses > my_misses:
            lines.append(f"- You under-detect goals scored by the OPPONENT ({opp_misses} of {n_missed} missed goals were the opponent's). On lopsided matches, the dominated team's rare goals are easy to miss — watch for them deliberately, especially against the run of play.")
        elif my_misses > opp_misses:
            lines.append(f"- You under-detect goals scored by the analyzed team ({my_misses} of {n_missed} missed goals). Don't let the analyzed team's dominance make you complacent on confirmed celebrations.")
        else:
            lines.append(f"- You missed {n_missed} real goals. Re-read the rule: a goal counts only on celebration + restart OR scoreboard change. If both are clear, count it even if camera quality is poor.")

    # Team flips
    if n_team_flipped:
        lines.append(f"- You misattribute scoring_team frequently ({n_team_flipped} flips in last {n_total}). When the ball crosses the line, find the celebrating jerseys and the team kicking off afterwards. Use the colour labels exactly as defined in MATCH CONTEXT.")

    # Zone corrections
    if n_zone_changed:
        lines.append(f"- This coach has corrected your `goal_placement` mapping {n_zone_changed} times. Be precise on `top/mid/low` and `near_post/centre/far_post` — re-watch the frame where the ball crosses the line, don't approximate.")

    # Attack type corrections
    if n_attack_changed:
        lines.append(f"- This coach has corrected your `attack_type` {n_attack_changed} times. Use the strict definitions: `corner` only if from a corner kick directly, `counter_attack` only if your team won the ball in own half and scored within ~20s, `open_play` is the default. Don't conflate them.")

    if not any([n_false_pos, n_missed, n_team_flipped, n_zone_changed, n_attack_changed, n_shot_changed]):
        # All corrections were "kept_as_is" — strong positive signal
        lines.append(f"- This coach has accepted all {n_kept} of your past candidates without changes. Your judgment is calibrated for this coach's matches; continue applying the same standards.")

    lines.append("")
    lines.append("Apply this calibration silently — don't mention it in your output. Just let it shift your thresholds and labels.")
    return "\n".join(lines)


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

        # D11 — prepend per-coach calibration from past corrections.
        # Cheap signal that gets richer with every match.
        calibration = _build_calibration_preamble(sb, job["coach_id"])
        if calibration:
            prompt = calibration + "\n\n---\n\n" + prompt

        # Append the GK technique reference if present. Adds ~35K tokens (~$0.04
        # per Pro analysis) but gives Gemini consistent canonical vocabulary
        # for `gk_observations`. See scripts/import-gk-encyclopedia-docx.js.
        encyclopedia_path = Path("/root/prompts/gk_techniques.md")
        if encyclopedia_path.exists():
            prompt += "\n\n---\n\n# REFERENCE — STIX Goalkeeper Technique Encyclopedia\n\n"
            prompt += "Use the technique names from this reference when describing GK actions. "
            prompt += "Do not invent vocabulary; if a technique you observe is not in this reference, describe it in plain observables.\n\n"
            prompt += encyclopedia_path.read_text(encoding="utf-8")

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
