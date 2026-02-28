import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // 1. Verify the requesting user is authenticated
    const supabase = await createClient();
    const { data: { user: coach } } = await supabase.auth.getUser();

    if (!coach) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Parse the request
    const { email, password, name, role, pitchside_keepers, dashboard_keepers, dashboard_access } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // 3. Use admin client to create the auth user
    const admin = createAdminClient();

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Skip email confirmation — coach is vouching for them
      user_metadata: {
        full_name: name || email.split('@')[0],
      },
    });

    if (createError) {
      // Handle duplicate email
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        return NextResponse.json({
          error: 'An account with this email already exists. Use "Invite by Email" instead, or ask them to log in with their existing account.'
        }, { status: 409 });
      }
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // 4. Create a profile record for the new user
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        full_name: name || email.split('@')[0],
        onboarding_complete: false, // Delegates don't need to complete coach onboarding
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Not fatal — profile might be created by a trigger
    }

    // 5. Create the delegate record linked to the new user
    const { data: delegateData, error: delegateError } = await admin
      .from('delegates')
      .insert({
        coach_id: coach.id,
        delegate_user_id: newUser.user.id,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        role: role || 'gk_parent',
        pitchside_keepers: pitchside_keepers || [],
        dashboard_keepers: dashboard_access ? (dashboard_keepers || []) : [],
        dashboard_access: dashboard_access || false,
        status: 'active',
      })
      .select()
      .single();

    if (delegateError) {
      // Clean up: delete the auth user if delegate record fails
      await admin.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json({ error: 'Failed to create delegate record: ' + delegateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      delegate: delegateData,
      message: `Account created for ${name || email}. Share the temporary password securely.`,
    });

  } catch (err) {
    console.error('Create delegate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
