"use client";
// Plays a short video window around an event.
//
// Two modes:
//   1) clipUrl provided   → the worker has pre-cut a ~7s MP4 with moov-at-front.
//                            Play it directly on native loop, no seeking. Fast,
//                            small (1–3 MB), instant in the browser.
//   2) sourceUrl + ts     → fallback when no clip exists yet. Seek to (ts − pre)
//                            inside the source file and loop manually within
//                            the window. Slow on large files (we can't stream
//                            multi-GB raw uploads).

import { useEffect, useRef, useState } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

// Fallback windowing used only when no pre-cut clip exists (legacy jobs
// awaiting backfill). Matches the goal-clip window from the worker.
const PRE_ROLL  = 5;
const POST_ROLL = 3;

export default function VideoClip({ clipUrl, sourceUrl, timestampSeconds, theme, label }) {
  const t = theme || tDark;
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [readyState, setReadyState] = useState(0);
  const [loadError, setLoadError] = useState(null);

  // Pick mode and effective URL. clipUrl wins when present.
  const usingClip = Boolean(clipUrl);
  const url = clipUrl || sourceUrl || "";

  const start = Math.max(0, (timestampSeconds || 0) - PRE_ROLL);
  const end = (timestampSeconds || 0) + POST_ROLL;

  // Track readyState for the diagnostic strip.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const events = ["loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "stalled", "suspend", "waiting"];
    const update = () => setReadyState(v.readyState);
    events.forEach(e => v.addEventListener(e, update));
    return () => events.forEach(e => v.removeEventListener(e, update));
  }, [url]);

  const readyStateLabel = ["NOTHING", "METADATA", "CURRENT_DATA", "FUTURE_DATA", "ENOUGH_DATA"][readyState] || "?";

  // Capture MediaError detail when something goes wrong.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onErr = () => {
      const e = v.error;
      const codeNames = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };
      setLoadError({
        code: e?.code ?? "?",
        name: codeNames[e?.code] ?? "UNKNOWN",
        message: e?.message || "(no message from browser)",
      });
    };
    const onOk = () => setLoadError(null);
    v.addEventListener("error", onErr);
    v.addEventListener("loadeddata", onOk);
    return () => {
      v.removeEventListener("error", onErr);
      v.removeEventListener("loadeddata", onOk);
    };
  }, []);

  // Source-mode only: seek to clip start once metadata is ready, then loop
  // manually within the (start, end) window. Clip-mode uses the native loop
  // attribute and starts at 0.
  useEffect(() => {
    if (usingClip) return;
    const v = videoRef.current;
    if (!v || !url) return;
    const seekAndPlay = () => {
      try { v.currentTime = start; } catch (_) {}
      v.play().catch(() => {});
    };
    if (v.readyState >= 1) {
      seekAndPlay();
    } else {
      const onLoaded = () => { seekAndPlay(); v.removeEventListener("loadedmetadata", onLoaded); };
      v.addEventListener("loadedmetadata", onLoaded);
      return () => v.removeEventListener("loadedmetadata", onLoaded);
    }
  }, [usingClip, url, start]);

  useEffect(() => {
    if (usingClip) return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= end) v.currentTime = start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [usingClip, start, end]);

  if (!url) {
    return (
      <div style={{ background: "#000", borderRadius: 10, border: `1px solid ${t.border}`, padding: 24, textAlign: "center", color: t.dim, fontSize: 12, fontFamily: FONT }}>
        No video available for this match.
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden", background: "#000" }}>
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        playsInline
        controls
        autoPlay={usingClip}
        loop={usingClip}
        preload="auto"
        style={{ width: "100%", display: "block", aspectRatio: "16 / 9", background: "#000" }}
      />
      {loadError && (
        <div style={{ padding: "10px 12px", background: "#3a1a1a", borderTop: `1px solid ${t.red}66`, fontSize: 11, color: t.red, fontFamily: FONT, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Video failed to load · error code {loadError.code} ({loadError.name})
          </div>
          <div style={{ color: "#ffaaaa", fontFamily: "monospace", fontSize: 10, marginBottom: 6 }}>
            {loadError.message}
          </div>
          <a href={url} target="_blank" rel="noopener" style={{ color: t.accent, textDecoration: "underline" }}>
            Try opening the video file directly →
          </a>
          <div style={{ marginTop: 6, color: "#ffaaaa99", fontSize: 10 }}>
            Code 2 = network/CORS · Code 3 = decode error · Code 4 = format/codec not supported by your browser
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#0a0d0f", borderTop: `1px solid ${t.border}`, fontFamily: FONT, fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }}
            style={{ background: "transparent", color: t.dim, border: `1px solid ${t.border}`, borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontFamily: FONT, fontSize: 11 }}
          >
            {muted ? "🔇 Muted" : "🔊 Sound"}
          </button>
          <span style={{ color: t.dim }}>
            {usingClip ? "auto-loop · pre-cut clip" : `Loop ${Math.floor(start)}s → ${Math.floor(end)}s`}
          </span>
        </div>
        {label && <span style={{ color: t.dim }}>{label}</span>}
      </div>
    </div>
  );
}
