"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function UploadPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070b0e", color: "#5c6b77", fontFamily: "'DM Sans', -apple-system, sans-serif", display: "grid", placeItems: "center" }}>Loading…</div>}>
      <UploadPage />
    </Suspense>
  );
}

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", red: "#ef4444",
  green: "#22c55e", yellow: "#eab308", orange: "#f97316",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const STATUS_LABEL = {
  queued: { label: "Queued", icon: "⏱", color: t.dim },
  analyzing: { label: "Analyzing", icon: "🔄", color: t.accent },
  review_needed: { label: "Review needed", icon: "👁", color: t.orange },
  published: { label: "Published", icon: "✓", color: t.green },
  failed: { label: "Failed", icon: "✗", color: t.red },
};

function fmtRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.round(diff / 60) + "m ago";
  if (diff < 86400) return Math.round(diff / 3600) + "h ago";
  return d.toLocaleDateString();
}

function Field({ label, children, hint, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 6 }}>
        {label} {required && <span style={{ color: t.red }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", fontSize: 13, borderRadius: 8,
  background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
  fontFamily: font,
};

function UploadPage() {
  const { user, profile, club, supabase, loading: authLoading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const initialKeeperId = params.get("keeper");

  const [keepers, setKeepers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Form state — sensible defaults
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    keeper_id: initialKeeperId || "",
    match_date: today,
    session_type: "match",
    opponent: "",
    venue: "home",
    age_group: "",            // U6..U18, Senior — drives Gemini spatial calibration
    my_team_color: "",
    opponent_color: "",
    my_keeper_color: "",
    was_subbed: false,
    sub_minute: "",
    sub_reason: "",
    video_url: "",
    use_chunking: false,
  });
  const setF = (patch) => setForm(s => ({ ...s, ...patch }));

  // File-upload state
  const [sourceMode, setSourceMode] = useState("file"); // "file" | "url"
  const [pickedFile, setPickedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0..100
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fmtSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };
  const onFilePicked = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setSubmitError("That file doesn't look like a video. Pick an .mp4, .mov, .webm or .mkv file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024 * 1024) {
      setSubmitError("File is over 5 GB — that's our cap for v1. Trim or compress and try again.");
      return;
    }
    setSubmitError("");
    setPickedFile(file);
  };

  // Upload via TUS resumable protocol.
  // Standard POST uploads to Supabase are capped at 50 MB; TUS lets us go up
  // to 5 GB (our bucket limit) and gives us native progress + resume on
  // network blips. Path: <user_id>/<timestamp>_<rand>/<filename>.
  const uploadFile = (file) => new Promise(async (resolve, reject) => {
    const tus = await import("tus-js-client");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return reject(new Error("Not authenticated"));

    const folder = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${user.id}/${folder}/${safeName}`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "match-videos",
        objectName: objectPath,
        contentType: file.type || "video/mp4",
        cacheControl: "3600",
      },
      // 6 MB chunks — Supabase's required size for resumable uploads.
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(new Error(`Upload failed: ${err.message || err}`)),
      onProgress: (loaded, total) => {
        setUploadProgress(Math.round((loaded / total) * 100));
      },
      onSuccess: () => resolve(objectPath),
    });
    upload.start();
  });

  // Load keepers + initial job list
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data: ks } = await supabase
        .from("keepers").select("*").eq("coach_id", user.id).eq("active", true)
        .order("number", { ascending: true });
      if (!mounted) return;
      setKeepers(ks || []);
      if (!form.keeper_id && ks?.[0]) setF({ keeper_id: ks[0].id });

      const res = await fetch("/api/video-jobs");
      const json = await res.json();
      if (mounted) {
        setJobs(json.jobs || []);
        setLoadingJobs(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime subscription for status updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("video_jobs_changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "video_jobs", filter: `coach_id=eq.${user.id}` },
        (payload) => {
          setJobs(prev => {
            if (payload.eventType === "INSERT") {
              return [payload.new, ...prev.filter(j => j.id !== payload.new.id)];
            }
            if (payload.eventType === "DELETE") {
              return prev.filter(j => j.id !== payload.old.id);
            }
            return prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (sourceMode === "file" && !pickedFile) {
      setSubmitError("Pick a video file to upload, or switch to 'Paste URL'.");
      return;
    }
    if (sourceMode === "url" && !form.video_url.trim()) {
      setSubmitError("Paste a direct video URL, or switch to 'Upload file'.");
      return;
    }

    setSubmitting(true);
    try {
      let videoUrl = form.video_url.trim();
      let storagePath = null;

      if (sourceMode === "file") {
        setUploading(true);
        setUploadProgress(0);
        storagePath = await uploadFile(pickedFile);
        // Generate a 2-hour signed URL for the worker to download from.
        const { data: signed, error: signErr } = await supabase.storage
          .from("match-videos").createSignedUrl(storagePath, 7200);
        if (signErr || !signed?.signedUrl) {
          throw new Error("Could not generate signed URL: " + (signErr?.message || "unknown"));
        }
        videoUrl = signed.signedUrl;
        setUploading(false);
      }

      const payload = {
        keeper_id: form.keeper_id,
        club_id: club?.id,
        match_date: form.match_date,
        session_type: form.session_type,
        opponent: form.session_type === "training" ? null : form.opponent,
        venue: form.session_type === "training" ? null : form.venue,
        age_group: form.age_group || null,
        my_team_color: form.my_team_color.trim().toLowerCase(),
        opponent_color: form.opponent_color.trim().toLowerCase(),
        my_keeper_color: form.my_keeper_color.trim().toLowerCase(),
        was_subbed: form.was_subbed,
        sub_minute: form.was_subbed && form.sub_minute ? parseInt(form.sub_minute, 10) : null,
        sub_reason: form.was_subbed ? form.sub_reason : null,
        video_url: videoUrl,
        storage_path: storagePath,
        use_chunking: form.use_chunking,
      };
      const res = await fetch("/api/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setShowForm(false);
      setPickedFile(null);
      setUploadProgress(0);
      setForm(s => ({ ...s, opponent: "", video_url: "", was_subbed: false, sub_minute: "", sub_reason: "" }));
    } catch (err) {
      setSubmitError(err.message || String(err));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const discardJob = async (id) => {
    if (!confirm("Discard this upload? It will be marked failed and removed from the queue.")) return;
    const res = await fetch(`/api/video-jobs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("Discard failed: " + (j.error || res.status));
    }
  };

  const retryJob = async (id) => {
    const res = await fetch(`/api/video-jobs/${id}`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("Retry failed: " + (j.error || res.status));
    }
  };

  const keeperById = useMemo(() => Object.fromEntries(keepers.map(k => [k.id, k])), [keepers]);

  if (authLoading) return <div style={{ minHeight: "100vh", background: t.bg, color: t.dim, fontFamily: font, display: "grid", placeItems: "center" }}>Loading…</div>;
  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: 960, margin: "0 auto" }}>
        <Link href="/dashboard" style={{ textDecoration: "none", color: t.bright, fontWeight: 700, fontSize: 16 }}>← StixAnalytix</Link>
        <div style={{ fontSize: 12, color: t.dim }}>Upload &amp; Auto-tag</div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>
        {/* TOP-OF-PAGE NOTICE */}
        <div style={{ padding: "10px 14px", borderRadius: 10, background: `${t.accent}10`, border: `1px solid ${t.accent}33`, marginBottom: 16, fontSize: 12, color: t.text }}>
          Paste a video URL (Hudl/Veo/Drive). Gemini analyzes it (~15–30 min) and parks the result for your review before anything lands on the dashboard.
        </div>

        {/* NEW UPLOAD BUTTON / FORM */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{ padding: "12px 18px", borderRadius: 10, background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", marginBottom: 24, fontFamily: font }}>+ New upload</button>
        ) : (
          <form onSubmit={submit} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, marginTop: 0, marginBottom: 16 }}>New video analysis</h2>

            <Field label="Keeper" required>
              <select value={form.keeper_id} onChange={e => setF({ keeper_id: e.target.value })} style={inputStyle} required>
                {keepers.map(k => <option key={k.id} value={k.id}>#{k.number} {k.name}</option>)}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Match date" required>
                <input type="date" value={form.match_date} onChange={e => setF({ match_date: e.target.value })} style={inputStyle} required />
              </Field>
              <Field label="Session type" required>
                <select value={form.session_type} onChange={e => setF({ session_type: e.target.value })} style={inputStyle}>
                  <option value="match">Match</option>
                  <option value="friendly">Friendly</option>
                  <option value="training">Training</option>
                </select>
              </Field>
            </div>

            {form.session_type !== "training" && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Field label="Opponent" required>
                  <input type="text" value={form.opponent} onChange={e => setF({ opponent: e.target.value })} style={inputStyle} placeholder="e.g. OFC 2016" required />
                </Field>
                <Field label="Venue" required>
                  <select value={form.venue} onChange={e => setF({ venue: e.target.value })} style={inputStyle}>
                    <option value="home">Home</option>
                    <option value="away">Away</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </Field>
              </div>
            )}

            <Field label="Age group" hint="Calibrates how the analyzer reads the field. Box and goal sizes vary by age.">
              <select value={form.age_group} onChange={e => setF({ age_group: e.target.value })} style={inputStyle}>
                <option value="">— pick age group (optional)</option>
                <option value="U6">U6</option>
                <option value="U7">U7</option>
                <option value="U8">U8</option>
                <option value="U9">U9</option>
                <option value="U10">U10</option>
                <option value="U11">U11</option>
                <option value="U12">U12</option>
                <option value="U13">U13</option>
                <option value="U14">U14</option>
                <option value="U15">U15</option>
                <option value="U16">U16</option>
                <option value="U17">U17</option>
                <option value="U18">U18</option>
                <option value="Senior">Senior</option>
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Your team kit" hint="Outfield" required>
                <input type="text" value={form.my_team_color} onChange={e => setF({ my_team_color: e.target.value })} style={inputStyle} placeholder="e.g. black" required />
              </Field>
              <Field label="Opponent kit" hint="Outfield" required>
                <input type="text" value={form.opponent_color} onChange={e => setF({ opponent_color: e.target.value })} style={inputStyle} placeholder="e.g. light blue" required />
              </Field>
              <Field label="Your GK kit" required>
                <input type="text" value={form.my_keeper_color} onChange={e => setF({ my_keeper_color: e.target.value })} style={inputStyle} placeholder="e.g. orange" required />
              </Field>
            </div>

            <Field label="Was the keeper subbed?">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.was_subbed} onChange={e => setF({ was_subbed: e.target.checked })} />
                Yes
              </label>
            </Field>
            {form.was_subbed && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <Field label="Sub minute">
                  <input type="number" min={0} max={120} value={form.sub_minute} onChange={e => setF({ sub_minute: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Reason">
                  <select value={form.sub_reason} onChange={e => setF({ sub_reason: e.target.value })} style={inputStyle}>
                    <option value="">(none)</option>
                    <option value="Removed – Injury">Removed – Injury</option>
                    <option value="Removed – Poor Play">Removed – Poor Play</option>
                    <option value="Removed – Other">Removed – Other</option>
                  </select>
                </Field>
              </div>
            )}

            <Field label="Video source" required hint={sourceMode === "file" ? "Pick the .mp4 file from your device. WiFi recommended for files over 500 MB." : "Direct video URL — only works if the URL ends in .mp4 / returns the raw video. XbotGo/Veo/Hudl share links don't work — use 'Upload file' instead."}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button type="button" onClick={() => setSourceMode("file")} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${sourceMode === "file" ? t.accent : t.border}`, background: sourceMode === "file" ? t.accent + "22" : "transparent", color: sourceMode === "file" ? t.accent : t.dim, fontSize: 12, fontWeight: 600, fontFamily: font, cursor: "pointer" }}>📁 Upload file</button>
                <button type="button" onClick={() => setSourceMode("url")} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${sourceMode === "url" ? t.accent : t.border}`, background: sourceMode === "url" ? t.accent + "22" : "transparent", color: sourceMode === "url" ? t.accent : t.dim, fontSize: 12, fontWeight: 600, fontFamily: font, cursor: "pointer" }}>🔗 Paste URL</button>
              </div>
              {sourceMode === "file" ? (
                <div>
                  <input ref={fileInputRef} type="file" accept="video/*" onChange={e => onFilePicked(e.target.files?.[0])} style={{ display: "none" }} />
                  {!pickedFile ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); onFilePicked(e.dataTransfer.files?.[0]); }}
                      style={{ padding: "32px 20px", textAlign: "center", border: `2px dashed ${t.border}`, borderRadius: 10, background: t.cardAlt, cursor: "pointer", color: t.dim }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
                      <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>Click to pick a file, or drag-drop here</div>
                      <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>.mp4 / .mov / .webm / .mkv up to 5 GB</div>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.cardAlt, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.bright, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📁 {pickedFile.name}</div>
                        <div style={{ fontSize: 11, color: t.dim }}>{fmtSize(pickedFile.size)}{pickedFile.size > 500 * 1024 * 1024 ? " · WiFi recommended" : ""}</div>
                      </div>
                      <button type="button" onClick={() => { setPickedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Replace</button>
                    </div>
                  )}
                  {uploading && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 6, background: t.cardAlt, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${uploadProgress}%`, height: "100%", background: t.accent, transition: "width 0.2s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: t.dim, marginTop: 4, textAlign: "center" }}>Uploading… {uploadProgress}%</div>
                    </div>
                  )}
                </div>
              ) : (
                <input type="url" value={form.video_url} onChange={e => setF({ video_url: e.target.value })} style={inputStyle} placeholder="https://…/video.mp4" />
              )}
            </Field>

            <Field label="Experimental: chunked analysis" hint="Splits the video into ~10-min segments and analyses each separately. Materially better timestamp accuracy on 30+ min matches but ~2× cost. Off by default while we A/B test.">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 12px", background: t.cardAlt, borderRadius: 8, border: `1px solid ${t.border}` }}>
                <input type="checkbox" checked={form.use_chunking} onChange={e => setF({ use_chunking: e.target.checked })} />
                Use chunked analysis for this match
              </label>
            </Field>

            <div style={{ background: t.cardAlt, padding: "10px 12px", borderRadius: 8, fontSize: 11, color: t.dim, marginTop: 8, marginBottom: 16 }}>
              Estimated cost: ~$5–15 per analysis (Gemini Pro). Processing usually takes 15–30 minutes.{form.use_chunking ? " Chunked mode roughly doubles both." : ""}
            </div>

            {submitError && <div style={{ color: t.red, fontSize: 12, marginBottom: 12 }}>{submitError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontFamily: font, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ padding: "10px 18px", borderRadius: 8, background: t.accent, color: "#fff", border: "none", fontWeight: 700, fontFamily: font, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Submitting…" : "Analyze Now"}
              </button>
            </div>
          </form>
        )}

        {/* STATUS LIST */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: t.bright, margin: "8px 0 12px", letterSpacing: 0.4 }}>RECENT UPLOADS</h2>
        {loadingJobs ? (
          <div style={{ color: t.dim, fontSize: 13 }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13 }}>
            No uploads yet. Click "+ New upload" to send your first video to Gemini.
          </div>
        ) : (
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
            {jobs.map((j, i) => {
              const meta = j.match_metadata || {};
              const s = STATUS_LABEL[j.status] || { label: j.status, icon: "?", color: t.dim };
              const k = keeperById[j.keeper_id];
              return (
                <div key={j.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : `1px solid ${t.border}` }}>
                  <div style={{ width: 28, fontSize: 18, color: s.color, textAlign: "center" }}>{s.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: t.bright, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {meta.match_date || "—"} · {meta.opponent || (meta.session_type === "training" ? "Training" : "—")}
                    </div>
                    <div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}>
                      {k ? `#${k.number} ${k.name}` : "Unknown keeper"} · {fmtRelative(j.created_at)}
                      {j.error_message ? <span style={{ color: t.red }}> · {j.error_message.slice(0, 80)}</span> : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {j.status === "review_needed" && (
                      <Link href={`/upload/${j.id}/review`} style={{ padding: "6px 12px", borderRadius: 6, background: t.orange, color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Review →</Link>
                    )}
                    {j.status === "published" && j.published_match_id && (
                      <Link href="/dashboard" style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.border}`, color: t.dim, fontSize: 11, textDecoration: "none" }}>View match</Link>
                    )}
                    {j.status === "failed" && (
                      <button onClick={() => retryJob(j.id)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Retry</button>
                    )}
                    {(j.status !== "published" && j.status !== "analyzing") && (
                      <button onClick={() => discardJob(j.id)} title="Discard" style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
