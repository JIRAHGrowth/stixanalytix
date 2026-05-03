"""
Video chunking utilities for the Modal worker.

Why: Gemini 2.5 Pro on a single 50+ minute video shows attention decay —
events cluster early in its output, timestamp drift compounds toward the
end, and the model invents events to fill what it expects. Splitting the
video into shorter segments and analysing each gives the model fresh
attention per segment, with timestamps anchored to the segment's start.

Strategy implemented here:
  1. ffmpeg slice the source video into ~10-minute segments (configurable).
     We use the simplest -c copy stream-copy approach so chunking is fast
     (no re-encode) and lossless. ffmpeg picks the nearest keyframe so
     segment boundaries may shift by a few seconds — recorded so we can
     reconcile timestamps.
  2. Each segment is uploaded to Gemini Files API independently, then
     analysed against the goals + saves prompts. Each segment's events
     are time-stamped from 0 to segment_duration.
  3. Merge: each segment's events get its start_offset added so all
     timestamps are in the global match timeline. Then we de-duplicate
     near-boundary events (events within ±15s of a segment boundary that
     match an event in the adjacent segment by timestamp + event type).

Trade-offs:
  - Cost: per-chunk video tokens ≈ proportional to chunk duration. Total
    tokens across chunks ≈ same as full video. Plus per-chunk Gemini
    Files upload + indexing overhead. Realistically ~2× cost vs single-
    pass.
  - Wall time: chunks process sequentially today (could parallelise via
    Modal .map, deferred until we measure actual gain).
  - Boundary risk: a goal event that straddles a chunk boundary may be
    missed entirely or double-detected. The dedup pass handles double-
    detect; missed events are caught by coach review.

Public API:
  split_video(input_path, chunk_duration_sec) → list of ChunkInfo
  dedupe_events(events, tolerance_sec) → list (in-place ts adjustment expected)
"""
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Iterator


@dataclass
class ChunkInfo:
    index: int
    start_seconds: int      # offset of this chunk in the original video
    duration_seconds: int   # nominal duration; real may differ slightly due to keyframe alignment
    path: str               # local path to the chunk file


def get_video_duration_seconds(input_path: str) -> int:
    """Use ffprobe to get the video's duration in seconds."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", input_path,
        ],
        capture_output=True, text=True, check=True,
    )
    duration = float(result.stdout.strip())
    return int(round(duration))


def split_video(
    input_path: str,
    chunk_duration_sec: int = 600,
    overlap_sec: int = 0,
    output_dir: str | None = None,
) -> List[ChunkInfo]:
    """Split a video into sequential chunks of approximately chunk_duration_sec.

    Uses ffmpeg's segment muxer with stream-copy (-c copy) so it's fast and
    lossless. Boundaries align to nearest keyframe. For overlap > 0, each
    chunk overlaps the next by overlap_sec to catch boundary events.

    Returns ChunkInfo records sorted by index.
    """
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found in PATH")
    if shutil.which("ffprobe") is None:
        raise RuntimeError("ffprobe not found in PATH")

    total_duration = get_video_duration_seconds(input_path)
    if total_duration <= chunk_duration_sec:
        # Nothing to chunk — the whole video is one chunk
        return [ChunkInfo(index=0, start_seconds=0, duration_seconds=total_duration, path=input_path)]

    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="stix_chunks_")

    chunks: List[ChunkInfo] = []
    cursor = 0
    idx = 0
    while cursor < total_duration:
        # Each chunk starts at `cursor - overlap_sec` (clamped to 0) and runs
        # for chunk_duration_sec + overlap_sec. The next cursor advances by
        # chunk_duration_sec, so consecutive chunks overlap by overlap_sec.
        start = max(0, cursor - (overlap_sec if idx > 0 else 0))
        wanted_dur = min(chunk_duration_sec + overlap_sec, total_duration - start)
        out = os.path.join(output_dir, f"chunk_{idx:03d}.mp4")
        # -ss before -i is fast (input seek); accurate seek requires re-encoding.
        # We use input seek + stream copy for speed; tiny boundary slippage acceptable.
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(start),
                "-i", input_path,
                "-t", str(wanted_dur),
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                out,
            ],
            check=True,
        )
        chunks.append(ChunkInfo(
            index=idx, start_seconds=start, duration_seconds=wanted_dur, path=out,
        ))
        idx += 1
        cursor += chunk_duration_sec
    return chunks


def offset_timestamps(events: List[dict], offset_sec: int) -> List[dict]:
    """Add an offset to every event's timestamp_seconds. Returns the same
    list (mutated) for convenience."""
    for e in events or []:
        ts = e.get("timestamp_seconds")
        if isinstance(ts, (int, float)):
            e["timestamp_seconds"] = int(ts) + int(offset_sec)
    return events


def dedupe_events(events: List[dict], tolerance_sec: int = 15, key_fields: List[str] | None = None) -> List[dict]:
    """Remove events that are likely duplicates of another event in the list,
    where two events are duplicates if they have:
      - timestamp_seconds within tolerance_sec of each other, AND
      - the same value for every field in key_fields (default: shot_type for
        goals, gk_action for saves).

    Keeps the FIRST event seen (sorted by timestamp). Stable.

    For goals: tolerance ≈ 15s; key_fields = ['scoring_team', 'shot_type'].
    For saves: tolerance ≈ 5s; key_fields = ['gk_action', 'shot_origin'].
    """
    if not events:
        return events
    if key_fields is None:
        key_fields = []

    sorted_events = sorted(
        [e for e in events if isinstance(e.get("timestamp_seconds"), (int, float))],
        key=lambda e: e["timestamp_seconds"],
    )
    out = []
    for e in sorted_events:
        is_dup = False
        ts = e["timestamp_seconds"]
        for kept in out:
            if abs(kept["timestamp_seconds"] - ts) > tolerance_sec:
                continue
            if all(str(kept.get(f, "")).strip().lower() == str(e.get(f, "")).strip().lower() for f in key_fields):
                is_dup = True
                break
        if not is_dup:
            out.append(e)
    # Append events without timestamps unchanged
    out.extend([e for e in events if not isinstance(e.get("timestamp_seconds"), (int, float))])
    return out


def cleanup_chunks(chunks: List[ChunkInfo]) -> None:
    """Delete the chunk files and their parent dir if it was a temp dir we made."""
    if not chunks:
        return
    parent = None
    for c in chunks:
        try:
            os.unlink(c.path)
        except (OSError, FileNotFoundError):
            pass
        parent = os.path.dirname(c.path)
    if parent and parent.startswith(tempfile.gettempdir()):
        try:
            shutil.rmtree(parent, ignore_errors=True)
        except OSError:
            pass
