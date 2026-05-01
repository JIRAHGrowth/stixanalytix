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


GOALS_RESPONSE_SCHEMA = {
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

# Phase 2.1 — every save event facing the analyzed team's goal.
# Reflects the existing pitchside vocabulary so the dashboard can read both
# manually-logged and auto-tagged events identically.
SAVES_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "saves": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "timestamp_seconds": {"type": "INTEGER"},
                    "match_clock": {"type": "STRING"},
                    "shot_origin": {"type": "STRING"},      # 6yard / boxL / boxC / boxR / outL / outC / outR / cornerL / cornerR / unclear
                    "shot_type": {"type": "STRING"},        # Foot / Header / Deflection
                    "on_target": {"type": "STRING"},        # yes / no / unclear
                    "gk_action": {"type": "STRING"},        # Catch / Block / Parry / Deflect / Punch / Missed / Goal / unclear
                    "gk_visible": {"type": "STRING"},       # yes / partial / no
                    "outcome": {"type": "STRING"},          # held / rebound_safe / rebound_dangerous / corner / out_of_play / goal
                    "body_distance_zone": {"type": "STRING"},  # A (near body) / B (within 2 yards) / C (full extension) / unclear — Mike Salmon framing
                    "goal_placement_height": {"type": "STRING"},  # top / mid / low / unclear (where the shot WOULD have gone if not saved)
                    "goal_placement_side": {"type": "STRING"},    # left_third / centre / right_third / unclear (GK perspective)
                    "shot_description": {"type": "STRING"},
                    "gk_observations": {"type": "STRING"},
                    "confidence": {"type": "STRING"},       # high / medium / low
                },
                "required": [
                    "timestamp_seconds", "match_clock", "shot_origin", "shot_type",
                    "on_target", "gk_action", "gk_visible", "outcome",
                    "body_distance_zone", "goal_placement_height", "goal_placement_side",
                    "shot_description", "gk_observations", "confidence",
                ],
            },
        }
    },
    "required": ["saves"],
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


@app.function(image=IMAGE, secrets=[secret], timeout=3600)
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
        import json
        meta = job.get("match_metadata") or {}

        # === Build the shared context (what we want cached) ===
        # Calibration + encyclopedia are constant across every prompt for this
        # match → goes in the cache. The video file is the biggest cached
        # item (typically ~200K+ tokens for a full match).
        calibration = _build_calibration_preamble(sb, job["coach_id"])
        encyclopedia_path = Path("/root/prompts/gk_techniques.md")
        encyclopedia_text = ""
        if encyclopedia_path.exists():
            encyclopedia_text = (
                "\n\n---\n\n# REFERENCE — STIX Goalkeeper Technique Encyclopedia\n\n"
                "Use the technique names from this reference when describing GK actions. "
                "Do not invent vocabulary; if a technique you observe is not in this reference, "
                "describe it in plain observables.\n\n"
                + encyclopedia_path.read_text(encoding="utf-8")
            )

        # Spatial calibration based on age group / field size (Phase 2.1)
        spatial_calibration = _build_spatial_calibration(meta)

        # === Download the source video to /tmp ===
        download_start = time.time()
        print(f"[download] fetching video from storage...", flush=True)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            r = requests.get(job["video_url"], stream=True, timeout=600)
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
            video_path = f.name
        size_mb = os.path.getsize(video_path) / (1024 * 1024)
        print(f"[download] {size_mb:.1f} MB in {time.time() - download_start:.0f}s", flush=True)

        # === Upload to Gemini Files API ===
        upload_start = time.time()
        print(f"[gemini] uploading file...", flush=True)
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        uploaded = genai.upload_file(path=video_path, mime_type="video/mp4")
        print(f"[gemini] uploaded in {time.time() - upload_start:.0f}s, waiting for indexing...", flush=True)

        # Hard ceiling on Gemini's PROCESSING wait. Without this, a stalled
        # Gemini file processor would hang the worker until Modal kills it
        # — which leaves the DB in 'analyzing' until the janitor sweeps it.
        process_start = time.time()
        PROCESS_TIMEOUT_SECS = 20 * 60  # 20 min hard cap on Gemini indexing
        last_log = time.time()
        while uploaded.state.name == "PROCESSING":
            if time.time() - process_start > PROCESS_TIMEOUT_SECS:
                raise RuntimeError(f"Gemini file processing exceeded {PROCESS_TIMEOUT_SECS}s — aborting")
            if time.time() - last_log > 60:
                print(f"[gemini] still indexing after {(time.time() - process_start):.0f}s...", flush=True)
                last_log = time.time()
            time.sleep(5)
            uploaded = genai.get_file(uploaded.name)
        print(f"[gemini] indexing done in {time.time() - process_start:.0f}s, state={uploaded.state.name}", flush=True)
        if uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file ended in state {uploaded.state.name}")

        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")

        # === Try to create a context cache (Phase 2.1 — cost optimisation) ===
        # If the cache contents fall under the model's minimum (~32K tokens for
        # 2.5-pro), the create call fails — we fall back to non-cached calls.
        cached = None
        try:
            from google.generativeai import caching as gcaching
            shared_system = (
                (calibration + "\n\n---\n\n" if calibration else "") +
                (spatial_calibration + "\n\n---\n\n" if spatial_calibration else "") +
                "(The video file and the technique encyclopedia below are constant context. "
                "Each subsequent prompt asks for a different event type.)"
                + encyclopedia_text
            )
            cached = gcaching.CachedContent.create(
                model="models/" + model_name,
                contents=[uploaded],
                system_instruction=shared_system,
                ttl="30m",
            )
            print(f"[cache] created {cached.name} (model={model_name}, ttl=30m)")
        except Exception as cache_err:
            print(f"[cache] could not create cache, falling back to direct calls: {cache_err}")

        def run_prompt(prompt_path: str, schema: dict, vars: dict) -> dict:
            template = Path(prompt_path).read_text(encoding="utf-8")
            prompt = _render_prompt(template, vars)
            generation_config = {
                "response_mime_type": "application/json",
                "response_schema": schema,
            }
            if cached is not None:
                # Cached path — only the variable prompt is sent (cheap).
                model = genai.GenerativeModel.from_cached_content(
                    cached_content=cached,
                    generation_config=generation_config,
                )
                resp = model.generate_content(prompt)
            else:
                # Fallback — full prompt every call.
                full = (
                    (calibration + "\n\n---\n\n" if calibration else "") +
                    (spatial_calibration + "\n\n---\n\n" if spatial_calibration else "") +
                    prompt + encyclopedia_text
                )
                model = genai.GenerativeModel(model_name, generation_config=generation_config)
                resp = model.generate_content([uploaded, full])
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
                    "cached_content_token_count": getattr(usage, "cached_content_token_count", None),
                }
            return {"raw": resp.text, "parsed": parsed, "usage": usage_dict}

        # === Run the goals prompt ===
        print("[goals] running goals.md")
        goals_result = run_prompt(
            "/root/prompts/goals.md",
            GOALS_RESPONSE_SCHEMA,
            {
                "my_team_color": meta.get("my_team_color"),
                "my_keeper_color": meta.get("my_keeper_color"),
                "opponent_color": meta.get("opponent_color"),
            },
        )
        goals_count = len((goals_result["parsed"] or {}).get("goals", [])) if goals_result["parsed"] else None
        print(f"[goals] detected {goals_count}")

        # === Run the saves prompt (Phase 2.1) ===
        saves_result = None
        saves_path = Path("/root/prompts/saves.md")
        if saves_path.exists():
            print("[saves] running saves.md")
            saves_result = run_prompt(
                str(saves_path),
                SAVES_RESPONSE_SCHEMA,
                {
                    "my_team_color": meta.get("my_team_color"),
                    "my_keeper_color": meta.get("my_keeper_color"),
                    "opponent_color": meta.get("opponent_color"),
                },
            )
            saves_count = len((saves_result["parsed"] or {}).get("saves", [])) if saves_result["parsed"] else None
            print(f"[saves] detected {saves_count}")

        # === Persist results ===
        gemini_output = {
            "model": model_name,
            "cached": cached is not None,
            "goals": goals_result,
            # Top-level shortcuts to keep the existing review screen working
            # without changes — it reads gemini_output.parsed.goals.
            "raw": goals_result["raw"],
            "parsed": goals_result["parsed"],
            "usage": goals_result["usage"],
        }
        if saves_result is not None:
            gemini_output["saves"] = saves_result

        sb.table("video_jobs").update({
            "status": "review_needed",
            "gemini_output": gemini_output,
            "finished_at": now(),
        }).eq("id", job_id).execute()

        # Best-effort cache cleanup (will auto-expire anyway via TTL)
        if cached is not None:
            try:
                cached.delete()
            except Exception:
                pass

        return {
            "job_id": job_id,
            "status": "review_needed",
            "goals_detected": goals_count,
            "saves_detected": (saves_count if saves_result is not None else None),
        }

    except Exception as e:
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": str(e)[:4000],
            "retry_count": (job.get("retry_count") or 0) + 1,
            "finished_at": now(),
        }).eq("id", job_id).execute()
        raise


def _build_spatial_calibration(meta: dict) -> str:
    """Field-size calibration so Gemini doesn't try to apply senior dimensions
    to a U10 pitch. Driven by `meta.age_group` and `meta.field_size`.

    Returns empty string if neither is set — Gemini falls back to its default
    spatial reasoning.
    """
    age = (meta or {}).get("age_group")
    if not age:
        return ""
    # Approximate field dimensions per common youth standards (yards).
    # (penalty_area, goal_area, goal_size_ft, field_length, field_width)
    DIMS = {
        "U6":  ((9, 5),   (3, 1.5),  (4, 6),    25, 20),
        "U7":  ((9, 5),   (3, 1.5),  (4, 6),    30, 25),
        "U8":  ((10, 6),  (4, 2),    (5, 8),    35, 25),
        "U9":  ((14, 7),  (5, 2),    (6, 12),   55, 35),
        "U10": ((22, 13), (8, 3),    (6.5, 18.5), 70, 45),
        "U11": ((22, 13), (8, 3),    (7, 21),   80, 50),
        "U12": ((30, 18), (12, 5),   (7, 21),   90, 55),
        "U13": ((44, 18), (20, 6),   (8, 24),   100, 60),
        "U14": ((44, 18), (20, 6),   (8, 24),   110, 65),
        "U15": ((44, 18), (20, 6),   (8, 24),   110, 70),
        "U16": ((44, 18), (20, 6),   (8, 24),   115, 75),
        "U17": ((44, 18), (20, 6),   (8, 24),   115, 75),
        "U18": ((44, 18), (20, 6),   (8, 24),   115, 75),
        "Senior": ((44, 18), (20, 6), (8, 24),  115, 75),
    }
    dims = DIMS.get(age)
    if not dims:
        return ""
    pa, ga, goal, fl, fw = dims
    return (
        f"# SPATIAL CALIBRATION — {age} match\n\n"
        f"Field dimensions for this match (yards):\n"
        f"- Field: ~{fl} long × {fw} wide\n"
        f"- Penalty area: ~{pa[0]} × {pa[1]}\n"
        f"- Goal area (6-yard box): ~{ga[0]} × {ga[1]}\n"
        f"- Goal size: ~{goal[0]} ft tall × {goal[1]} ft wide\n\n"
        "When describing distance or location, use proportions to visible field "
        "markings — NOT absolute yards from the senior game. 'Edge of the penalty area, "
        "central' is correct. '20 yards out' is wrong if the penalty area on this field "
        f"is only {pa[0]} yards deep. When describing goal placement, use proportions "
        "of the goal mouth ('top right third', 'low left third', 'central'). Avoid "
        "absolute heights or precise corner positions — single-camera 2D footage cannot "
        "support that precision honestly.\n"
    )


@app.function(image=IMAGE, secrets=[secret], schedule=modal.Period(minutes=10))
def janitor() -> dict:
    """Run every 10 min. Marks any job stuck in 'analyzing' for >65 min as
    failed — covers Modal timeouts, crashes, OOM kills, etc. that prevent the
    main `process` function's exception handler from running.

    The 65-min ceiling = 60-min main timeout + 5-min buffer for clock skew.
    """
    import os as _os
    from datetime import datetime, timezone, timedelta
    from supabase import create_client as _create_client

    sb = _create_client(
        _os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        _os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=65)).isoformat()
    res = sb.table("video_jobs").select("id, started_at").eq("status", "analyzing").lt("started_at", cutoff).execute()
    rescued = []
    for row in (res.data or []):
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": "Worker died without writing status (timeout / crash / OOM). Auto-recovered by janitor. Retry from the upload page.",
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", row["id"]).execute()
        rescued.append(row["id"])
    return {"rescued": rescued, "count": len(rescued)}


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
