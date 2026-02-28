"use client";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [delegateOf, setDelegateOf] = useState(null);
  const [isDelegate, setIsDelegate] = useState(false);

  const supabaseRef = useRef(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  useEffect(() => {
    let mounted = true;

    // One function that loads everything for a given user
    const loadUserData = async (authUser) => {
      if (!authUser || !mounted) {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setClub(null);
          setDelegateOf(null);
          setIsDelegate(false);
          setLoading(false);
        }
        return;
      }

      setUser(authUser);

      // Fetch profile
      const { data: p } = await supabase
        .from("profiles").select("*").eq("id", authUser.id).single();

      if (!mounted) return;
      setProfile(p || null);

      // Fetch club (coach's own club, or delegate's coach's club)
      if (p?.onboarding_complete) {
        const { data: c } = await supabase
          .from("clubs").select("*").eq("coach_id", authUser.id).single();
        if (mounted && c) setClub(c);
      }

      // Check delegate status
      const { data: delRecs } = await supabase
        .from("delegates").select("*")
        .eq("delegate_user_id", authUser.id).eq("status", "active");

      if (!mounted) return;

      if (delRecs && delRecs.length > 0) {
        const d = delRecs[0];
        const { data: coachP } = await supabase
          .from("profiles").select("full_name").eq("id", d.coach_id).single();
        const { data: coachC } = await supabase
          .from("clubs").select("*").eq("coach_id", d.coach_id).single();

        if (mounted) {
          setDelegateOf({
            delegate_id: d.id,
            coach_id: d.coach_id,
            coach_name: coachP?.full_name || "Coach",
            club: coachC,
            role: d.role,
            pitchside_keepers: d.pitchside_keepers || [],
            dashboard_keepers: d.dashboard_keepers || [],
            dashboard_access: d.dashboard_access || false,
          });
          setIsDelegate(true);
          if (!p?.onboarding_complete && coachC) setClub(coachC);
        }
      } else {
        if (mounted) {
          setDelegateOf(null);
          setIsDelegate(false);
        }
      }

      if (mounted) setLoading(false);
    };

    // Use onAuthStateChange as the SINGLE source of truth
    // It fires INITIAL_SESSION on setup, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT" || !session?.user) {
          setUser(null);
          setProfile(null);
          setClub(null);
          setDelegateOf(null);
          setIsDelegate(false);
          setLoading(false);
          return;
        }

        // For any event with a valid session, load user data
        // Use setTimeout(0) to avoid Supabase deadlock warning
        setTimeout(() => {
          if (mounted) loadUserData(session.user);
        }, 0);
      }
    );

    // Safety net: if nothing fires within 5 seconds, stop loading
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setProfile(null);
    setClub(null);
    setDelegateOf(null);
    setIsDelegate(false);
    window.location.href = "/login";
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data: p } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (p) setProfile(p);
  };

  return (
    <AuthContext.Provider value={{
      user, profile, club, loading, signOut, refreshProfile,
      supabase, delegateOf, isDelegate,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

