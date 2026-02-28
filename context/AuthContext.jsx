"use client";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);

  // Delegate state
  const [delegateOf, setDelegateOf] = useState(null);
  const [isDelegate, setIsDelegate] = useState(false);

  // Use a ref so we create the client once, not on every render
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const supabase = supabaseRef.current;

  useEffect(() => {
    let mounted = true;

    const getSession = async () => {
      try {
        // First try to get the session (this refreshes the token if needed)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          // No valid session — clear everything cleanly
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

        // Session is valid — now get the user (server-verified)
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

        if (userError || !currentUser) {
          // Token exists but is invalid/expired — force sign out to clear stale cookies
          await supabase.auth.signOut();
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

        if (mounted) {
          setUser(currentUser);
          await fetchProfile(currentUser.id);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth init error:", err);
        // On any error, clear state so the user isn't stuck
        if (mounted) {
          setUser(null);
          setProfile(null);
          setClub(null);
          setDelegateOf(null);
          setIsDelegate(false);
          setLoading(false);
        }
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" && !session) {
          setUser(null);
          setProfile(null);
          setClub(null);
          setDelegateOf(null);
          setIsDelegate(false);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setClub(null);
          setDelegateOf(null);
          setIsDelegate(false);
        }
        setLoading(false);
      }
    );

    // Safety net: never stay loading for more than 5 seconds
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading timeout — clearing state");
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
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

      // Fetch club if onboarding is complete (user is a coach)
      if (profileData.onboarding_complete) {
        const { data: clubData } = await supabase
          .from("clubs")
          .select("*")
          .eq("coach_id", userId)
          .single();

        if (clubData) setClub(clubData);
      }

      // Check if this user is a delegate for another coach
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
    // Always clear state, even if signOut throws
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
      signOut,
      refreshProfile,
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

