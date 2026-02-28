"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);

  // Delegate state
  const [delegateOf, setDelegateOf] = useState(null); // { coach_id, coach_name, club, role, pitchside_keepers, dashboard_keepers, dashboard_access }
  const [isDelegate, setIsDelegate] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser) {
        setUser(currentUser);
        await fetchProfile(currentUser.id);
      }
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
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
    }
  };

  const fetchDelegateStatus = async (userId) => {
    const { data: delegateRecords } = await supabase
      .from("delegates")
      .select("*")
      .eq("delegate_user_id", userId)
      .eq("status", "active");

    if (delegateRecords && delegateRecords.length > 0) {
      // For now, use the first active delegation
      // Future: support multiple coach delegations
      const d = delegateRecords[0];

      // Fetch the coach's profile and club for display
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

      // If the delegate user hasn't completed onboarding (they're not a coach),
      // set the club from their coach so the app has context
      if (!club && coachClub) {
        setClub(coachClub);
      }
    } else {
      setDelegateOf(null);
      setIsDelegate(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
      // Delegate context
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

