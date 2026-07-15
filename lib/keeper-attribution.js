// Shared logic for attributing an event to the correct keeper on a two-keeper
// match, and for deriving `half` from a timestamp. Used by:
//   - app/api/video-jobs/[id]/publish/route.js  (video publish)
//   - supabase/migrations/*_save_pitchside_match_rpc.sql (via SQL — the same
//     convention is duplicated in PL/pgSQL so keep them in lockstep when
//     changing the boundary rule)
//   - scripts/*  (backfills / eval / smoke tests)
//
// Convention: "sub at minute N" means GK2 comes on at N:00. Any event with
// timestamp_seconds < N*60 belongs to the primary keeper; anything at or
// after belongs to the secondary. Events with no timestamp remain on primary
// (we can't safely split without a time signal — see review UI for the coach
// to override).

// Return the keeper_id an event should be attributed to.
//
//   match: { keeper_id, secondary_keeper_id, sub_minute, was_subbed }
//   timestampSeconds: number | null
//
// Returns match.keeper_id in every case except: was_subbed AND sub_minute set
// AND secondary_keeper_id set AND timestampSeconds >= sub_minute*60.
export function attributeEventToKeeper(match, timestampSeconds) {
  if (!match || !match.keeper_id) return null;
  if (!match.was_subbed) return match.keeper_id;
  if (!match.sub_minute || !match.secondary_keeper_id) return match.keeper_id;
  if (!Number.isFinite(timestampSeconds)) return match.keeper_id;
  return timestampSeconds >= match.sub_minute * 60
    ? match.secondary_keeper_id
    : match.keeper_id;
}

// Derive H1/H2 from a timestamp. Assumes matches are two 45-min halves with
// stoppage rolling into the same "half" until the whistle. Youth video often
// runs long (105-120 minutes for U-16 games with stoppage), so we treat
// anything under 60 minutes as H1 and anything >= 60 minutes as H2. This
// matches the observed pattern in existing data.
//
// If the actual half boundary is known (video worker output includes a half
// tag), prefer that — this is a fallback for when publish/pitchside doesn't
// have an authoritative signal.
export function deriveHalfFromTimestamp(timestampSeconds, fallbackHalf = null) {
  if (fallbackHalf === 'H1' || fallbackHalf === 'H2' || fallbackHalf === 1 || fallbackHalf === 2) {
    return typeof fallbackHalf === 'number' ? `H${fallbackHalf}` : fallbackHalf;
  }
  if (!Number.isFinite(timestampSeconds)) return null;
  return timestampSeconds < 60 * 60 ? 'H1' : 'H2';
}
