-- DELETE policies for tables that the save_pitchside_match RPC replaces by
-- match_id (delete-then-insert). Without these, RLS silently filters the
-- DELETE to 0 affected rows and the function leaves stale child rows in
-- place on retry, breaking idempotency.
--
-- Pattern per table mirrors that table's INSERT policy:
--   - Coaches: auth.uid() = coach_id
--   - Delegates: any active delegate for that coach (matches the existing
--     INSERT policy on shot_events / distribution_events — looser than
--     matches, but consistent with how those tables already gate writes)

-- shot_events: no DELETE policy existed at all.
CREATE POLICY "Coaches can delete their own shot_events"
  ON public.shot_events FOR DELETE TO authenticated
  USING (auth.uid() = coach_id);

CREATE POLICY "Delegates can delete shot_events"
  ON public.shot_events FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delegates d
    WHERE d.delegate_user_id = auth.uid()
      AND d.coach_id = shot_events.coach_id
      AND d.status = 'active'
  ));

-- distribution_events: no DELETE policy existed at all.
CREATE POLICY "Coaches can delete their own distribution_events"
  ON public.distribution_events FOR DELETE TO authenticated
  USING (auth.uid() = coach_id);

CREATE POLICY "Delegates can delete distribution_events"
  ON public.distribution_events FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delegates d
    WHERE d.delegate_user_id = auth.uid()
      AND d.coach_id = distribution_events.coach_id
      AND d.status = 'active'
  ));

-- goals_conceded: had coach-only DELETE. Add delegate path so delegate
-- retries clean up before re-inserting.
CREATE POLICY "Delegates can delete goals_conceded"
  ON public.goals_conceded FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delegates d
    WHERE d.delegate_user_id = auth.uid()
      AND d.coach_id = goals_conceded.coach_id
      AND d.status = 'active'
  ));

-- match_attributes: had coach-only DELETE. Same fix as goals_conceded.
CREATE POLICY "Delegates can delete match_attributes"
  ON public.match_attributes FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delegates d
    WHERE d.delegate_user_id = auth.uid()
      AND d.coach_id = match_attributes.coach_id
      AND d.status = 'active'
  ));
