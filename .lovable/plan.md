# Google sign-in: status and owner steps (answer only, no code changes)

## (1) Enabled? — No (treat as not enabled)
- The managed sign-in module (`src/integrations/lovable/`) and the `@lovable.dev/cloud-auth-js` package are absent from the repo, and no code calls Google sign-in. Both get created when Google is turned on through Lovable.
- I cannot read the hosted provider toggle without changing it, so the live setting itself is unverified. With no evidence it was configured, assume it is off.
- Important: on Lovable Cloud, the managed Google flow uses `lovable.auth.signInWithOAuth("google", { redirect_uri })`, not `supabase.auth.signInWithOAuth({ provider: 'google' })`. A direct Supabase call fails with "Unsupported provider" unless you bring your own Google credentials (option B below).

## (2) Owner steps
Option A, managed Google (recommended, no Google Cloud setup):
1. Cloud → Users → Auth Settings → Sign In Methods → Google → enable. (Or approve an agent pass that runs the Configure Social Login tool for `google`. That generates the lovable module, which counts as a code change, Class C auth.)
2. In the same screen, keep **signups disabled** (`disable_signup = true`). New Google identities are then refused, so registration stays closed.
3. Existing Gmail owner: Supabase links a Google identity to an existing user that has the **same verified email**. You get the same user id and the same projects, not a new empty user. To be safe, first confirm in Cloud → Users that the owner row's email exactly matches the Gmail address and is confirmed.
4. Sign in once with Google on the live site and check that the user id matches the existing owner id (the /auth page shows it).

Option B, your own Google client (needed only if you must keep `supabase.auth.signInWithOAuth` exactly):
1. Google Cloud Console → OAuth consent screen: add authorized domain `aivideotool.lovable.app`, with scopes email, profile, openid.
2. Credentials → OAuth Client ID (Web): set the redirect URI to the callback URL shown in Cloud → Users → Auth Settings → Google.
3. Paste the Client ID and Secret into that Google section, then enable it. Keep signups disabled as in A.2.
4. Make sure `https://aivideotool.lovable.app/auth` is on the auth redirect allow-list.

## (3) Do preview origins need redirect URIs?
- Option A: no. The managed broker handles the preview, `*.lovable.app`, and custom domains automatically, and the preview iframe uses a popup.
- Option B: yes. Add the preview origin (`https://id-preview--bd21b544-c7b8-4780-bdde-391ac9d4bfa8.lovable.app/auth`) to the auth redirect allow-list. The Google console only needs the single Supabase callback URL, not each app origin.

No app code, SQL, or settings were changed.
