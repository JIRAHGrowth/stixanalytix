"use client";
import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authStuck, setAuthStuck] = useState(false);

  // Delegate state
  const [delegateOf, setDelegateOf] = useState(null);
  const [isDelegate, setIsDelegate] = useState(false);

  // Single Supabase client instance
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const supabase = supabaseRef.current;

  // Track if we've resolved auth
  const resolvedRef = useRef(false);

  const clearAllState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setClub(null);
    setDelegateOf(null);
    setIsDelegate(false);
    setLoading(false);
    resolvedRef.current = true;
  }, []);

  // Force clear — nuclear option called from the UI
  const forceClearSession = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignore
    }
    // Also hit the server-side cookie clear endpoint
    try {
      await fetch("/api/clear-session", { method: "POST" });
    } catch (e) {
      // Ignore
    }
    clearAllState();
    window.location.href = "/login";
  }, [supabase, clearAllState]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Use getSession first — it reads from cookies/memory, fast
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError || !session) {
          // No session at all — clean state, not stuck
          clearAllState();
          return;
        }

        // Session exists — verify with the server
        const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (userError || !verifiedUser) {
          // Stale session — force clear
          try {
            await supabase.auth.signOut();
          } catch (e) {
            // If signOut fails, hit the API
            try { await fetch("/api/clear-session", { method: "POST" }); } catch (e2) {}
          }
          clearAllState();
          return;
        }

        // User is verified — load their data
        setUser(verifiedUser);
        await fetchProfile(verifiedUser.id);

        if (mounted) {
          setLoading(false);
          resolvedRef.current = true;
        }

      } catch (err) {
        console.error("Auth init error:", err);
        if (mounted) clearAllState();
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT") {
          clearAllState();
          return;
        }

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
          setLoading(false);
          resolvedRef.current = true;
        } else {
          clearAllState();
        }
      }
    );

    // Safety net #1: Show "stuck" UI after 4 seconds
    const stuckTimer = setTimeout(() => {
      if (mounted && !resolvedRef.current) {
        setAuthStuck(true);
      }
    }, 4000);

    // Safety net #2: Force clear after 8 seconds
    const forceTimer = setTimeout(() => {
      if (mounted && !resolvedRef.current) {
        console.warn("Auth force timeout — clearing session");
        clearAllState();
      }
    }, 8000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(stuckTimer);
      clearTimeout(forceTimer);
    };
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !profileData) {
        setProfile(null);
        setClub(null);
        return;
      }

      setProfile(profileData);

      if (profileData.onboarding_complete) {
        const { data: clubData } = await supabase
          .from("clubs")
          .select("*")
          .eq("coach_id", userId)
          .single();

        if (clubData) setClub(clubData);
      }

      await fetchDelegateStatus(userId);
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  };

  const fetchDelegateStatus = async (userId) => {
    try {
      const { data: delegateRecords } = await supabase
        .from("delegates")
        .select("*")
        .eq("delegate_user_id", userId)
        .eq("status", "active");

      if (delegateRecords && delegateRecords.length > 0) {
        const d = delegateRecords[0];

        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", d.coach_id)
          .single();

        const { data: coachClub } = await supabase
          .from("clubs")
          .select("*")
          .eq("coach_id", d.coach_id)
          .single();

        setDelegateOf({
          delegate_id: d.id,
          coach_id: d.coach_id,
          coach_name: coachProfile?.full_name || "Coach",
          club: coachClub,
          role: d.role,
          pitchside_keepers: d.pitchside_keepers || [],
          dashboard_keepers: d.dashboard_keepers || [],
          dashboard_access: d.dashboard_access || false,
        });
        setIsDelegate(true);

        if (!club && coachClub) {
          setClub(coachClub);
        }
      } else {
        setDelegateOf(null);
        setIsDelegate(false);
      }
    } catch (err) {
      console.error("Delegate status error:", err);
      setDelegateOf(null);
      setIsDelegate(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    try {
      await fetch("/api/clear-session", { method: "POST" });
    } catch (e) {}

    setUser(null);
    setProfile(null);
    setClub(null);
    setDelegateOf(null);
    setIsDelegate(false);
    window.location.href = "/";
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      club,
      loading,
      authStuck,
      signOut,
      refreshProfile,
      forceClearSession,
      supabase,
      delegateOf,
      isDelegate,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

