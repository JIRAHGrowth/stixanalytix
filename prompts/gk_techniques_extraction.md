You are extracting structured goalkeeper technique knowledge from a coaching video. The video shows a coach demonstrating and explaining one or more goalkeeper techniques. Your job is to produce a clean reference entry per technique that another model (also Gemini) will later use to recognise the same technique in live match footage.

You will receive both the video and its audio. Use both — what the coach SAYS is as important as what they SHOW.

For each distinct technique demonstrated or discussed in the video, produce one entry with these fields:

- `name`: the canonical technique name as the coach uses it. Verbatim from their speech where possible. If they use multiple terms, pick the one used most often.
- `aliases`: array of other names you heard for the same technique (e.g. "smother", "swallow", "claim at feet"). Include the coach's word AND any synonyms they explicitly call out.
- `gemini_default_terms`: array of words/phrases a model trained on generic broadcast football commentary would use for this — best guess. Examples: "front dive", "forward dive", "dives at feet". This helps the downstream model bridge its default vocabulary into the coach's vocabulary.
- `purpose`: 1 short sentence — what scenario the technique is for. ("Used when the attacker is one-on-one with the keeper and the ball is loose at the attacker's feet near the box.")
- `visual_indicators`: array of 3-7 specific things visible in the video that identify this technique. Each item should be observable in a single frame or short sequence, not interpretive. ("GK lowers centre of gravity 2-3 yards before contact" / "GK extends arms to wrap around ball with body" / "GK ends on side, not back").
- `coach_cues`: array of the coach's verbatim verbal cues from the video — exact quotes that signal this technique. Include timestamps in MM:SS format. ([{"timestamp": "01:23", "quote": "We go through the line, not at it"}])
- `distinguishes_from`: array of techniques this is most often confused with, plus the key differentiator. ([{"technique": "parry", "differentiator": "smother engages BEFORE the shot leaves the foot; parry happens AFTER ball is struck"}])
- `common_mistakes`: array of errors the coach corrects in the video, if any.
- `source`: object with `video_filename` (which you'll be told), `coach_name` (if mentioned), `key_timestamps` (the MM:SS ranges where the technique is shown — so a human reviewer can verify).

Rules:
- ONE entry per distinct technique. If the video covers multiple techniques, return multiple entries.
- If the video doesn't actually demonstrate any specific technique (e.g. it's a warmup or general motivational content), return an empty `techniques` array and a `notes` field explaining why.
- Quote the coach exactly. Don't paraphrase their cues.
- Don't make up things you didn't see or hear. If a field is empty, return an empty array, not a guess.
- Visual indicators must be camera-observable, not coach-interpretive. "Hands form a W behind the ball" is good; "good positioning" is not.

Return a JSON object with this shape:

```
{
  "techniques": [
    {
      "name": "...",
      "aliases": [...],
      "gemini_default_terms": [...],
      "purpose": "...",
      "visual_indicators": [...],
      "coach_cues": [{"timestamp": "MM:SS", "quote": "..."}],
      "distinguishes_from": [{"technique": "...", "differentiator": "..."}],
      "common_mistakes": [...],
      "source": {
        "video_filename": "...",
        "coach_name": "...",
        "key_timestamps": ["MM:SS - MM:SS", ...]
      }
    }
  ],
  "notes": "..."  // optional, only if the video has caveats or is non-technique content
}
```
