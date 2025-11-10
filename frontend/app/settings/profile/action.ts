// frontend/app/settings/profile/actions.ts
'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server Action to update the user's profile.
 * Works with a form like:
 *  <input name="full_name" />
 *  <textarea name="bio" />
 *  <input type="file" name="avatar" />
 */
export async function updateProfile(formData: FormData) {
  // Read form fields
  const fullName = (formData.get('full_name') ?? '').toString();
  const bio = (formData.get('bio') ?? '').toString();
  const avatar = formData.get('avatar') as File | null;

  // Choose your API base (Django) – change if yours is different
  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:8000';

  try {
    // If there is a file, send multipart; otherwise send JSON
    if (avatar && typeof avatar === 'object') {
      const body = new FormData();
      body.set('full_name', fullName);
      body.set('bio', bio);
      body.set('avatar', avatar);

      const res = await fetch(`${API_BASE}/api/profile/`, {
        method: 'PATCH', // or 'POST' if your API expects it
        body,
        // credentials / auth headers if needed:
        // credentials: 'include',
        // headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      const res = await fetch(`${API_BASE}/api/profile/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // Authorization header if you need it
        },
        body: JSON.stringify({ full_name: fullName, bio }),
        // credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }

    // Revalidate the profile settings page so UI updates
    revalidatePath('/settings/profile');
    return { ok: true };
  } catch (err) {
    console.error('updateProfile failed:', err);
    return { ok: false, error: 'Failed to update profile' };
  }
}
