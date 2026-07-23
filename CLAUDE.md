# Syrena Voyager — Operator Notes

Note: the project directory, bundle ID (`com.alegro.syrena-travel`), and Firebase project (`syrena-travel`) keep the old slug for continuity. Only the user-facing name is "Syrena Voyager".

Invite-only travel-recommendation app. React Native (Expo Router) + Firebase.

## App Store Connect

- **App ID**: `6759737888`
- **Bundle ID**: `com.alegro.syrena-travel`
- **App Store Connect**: https://appstoreconnect.apple.com/apps/6759737888

## Apple App Review demo account

Apple needs working credentials to test the app. We've had multiple App Review rejections because the demo account was broken — Apple couldn't sign in and reported whatever screen they got stuck on (often the welcome popup) as the bug.

**Canonical demo credentials** (also stored in App Store Connect → App Review Information):

- Email: `reviewer@syrenatravel.app`
- Password: `SyrenaReview2026`

These are deliberately autocorrect-proof: no period in the email local part (autocorrect was mangling `apple.review@…` → `applereview@…` on iPad's keyboard) and no special characters in the password (so clipboard handlers can't drop the trailing `!`).

**Before every App Store submission, run:**

```bash
npm run check:demo
```

That script:
1. Tries to sign in with the canonical credentials.
2. If sign-in fails, attempts to re-create the account.
3. Ensures the Firestore `users/{uid}` doc has `status: "approved"` (so the user doesn't bounce to the pending-approval screen).
4. Exits non-zero if it cannot heal — print the failure mode and required manual action.

If the script exits non-zero with "account exists but password is wrong":
- Either set `SYRENA_DEMO_EMAIL` to a new address and re-run, then update App Store Connect with the new email.
- Or use Firebase Console → Authentication to manually reset the password to `Syrena2026Review!`.

## End-to-end submit flow

```bash
npm run submit:ios
```

That's `check:demo && eas build --platform ios --profile production --non-interactive && eas submit --platform ios --latest --non-interactive`.

After EAS uploads the binary, you still need to:
1. Wait ~5–10 min for Apple to process.
2. Go to App Store Connect → Distribution → version → Build section.
3. Hover the existing build row to reveal the red minus, click it.
4. Click "Add Build" and select the new build.
5. Save, then "Update Review" / "Add for Review".
6. On the resulting submission page, click "Resubmit to App Review".

## App Store rejection history (lessons)

1. **First rejection** — welcome popup close button was unresponsive on iPad. Root cause: `<Video pointerEvents="none" />` from expo-av doesn't actually propagate that prop to the underlying AVPlayerLayer, so the video swallowed touches.
   - **Fix**: wrapped the Video in `<View pointerEvents="none">{video}</View>`.
   - **Better fix (shipped in build 56)**: removed the video entirely — replaced with a solid navy background. Welcome popup is now bulletproof: X button top-right, CLOSE button bottom, tap-anywhere-outside-to-close, and Android back button all dismiss it.

2. **Second rejection** — privacy purpose strings (Guideline 5.1.1) weren't specific enough. Apple wants concrete examples.
   - **Fix**: rewrote `NSLocationWhenInUseUsageDescription` and `NSPhotoLibraryUsageDescription` in `app.json` to lead with what the app does and include one concrete example each.

3. **Third rejection** — demo account `applereview@syrenatravel.com` credentials were dead. Apple got `INVALID_LOGIN_CREDENTIALS` from Firebase and couldn't even sign in.
   - **Fix**: created a new account `apple.review@syrenatravel.app` / `Syrena2026Review!`, updated App Store Connect, added the `check:demo` script above as a permanent guard.

4. **Fourth rejection** — even though the demo account was alive, Apple's reviewer typed the credentials wrong (iPad autocorrect was mangling the email's period). Got "Invalid email or password".
   - **Fix (shipped in build 57)**: (a) switched to `reviewer@syrenatravel.app` / `SyrenaReview2026` — no period in email, no special chars in password; (b) hardened sign-in TextInputs with `textContentType`, `autoComplete`, `spellCheck={false}`, `importantForAutofill="yes"`; (c) normalized the email server-side with `.trim().toLowerCase()` before passing to Firebase Auth.

5. **Fifth rejection** — Apple kept citing the location purpose string even after multiple rewrites. Lesson learned: **Apple's reviewers want the exact pattern from their own docs.** Their golden example is `"The app shares your current location with a delivery service when you place a delivery order."` — subject + passive verb + specific use cases + concrete user trigger. Avoid marketing-style "For example, ..." phrasing — it reads as filler. Match the pattern exactly.
   - **Fix (shipped in build 60)**: rewrote `NSLocationWhenInUseUsageDescription` to: `"Your current location is used to display your position on the Map tab and to sort recommended restaurants, bars, and hotels by distance when you tap Near Me on the Explore tab."` (subject + "is used" + two specific use cases + the literal button name that triggers it).

6. **Sixth rejection (v1.1 build 70)** — two issues:
   - **5.1.1(ii) camera purpose string**: we had fixed location + photos strings but `expo-image-picker`'s `cameraPermission` was never set, so `NSCameraUsageDescription` fell back to the vague plugin default. Lesson: **when auditing purpose strings, list EVERY `NS*UsageDescription` the built Info.plist will contain** (check each config plugin's defaults), not just the ones already written in app.json.
   - **5.1.1(v) account deletion**: the flow existed but had a dead end — Firebase requires a recent sign-in for `deleteUser`, and our guard told stale sessions to "sign out and sign back in first." Apple counts any non-completable deletion flow as *no deletion*. Fix (build 71): in-place re-authentication — `Alert.prompt` for the password → `reauthenticateWithCredential` → wipe Firestore docs → `deleteUser`. On resubmission Apple wants a **screen recording from a physical device** of the complete deletion flow (sign in with demo → delete → confirmation) attached via a link in the review notes / reply.

## Fatal crash class: unstable zustand selectors

Never return a freshly-created object from a zustand selector (`useStore((s) => new Set(...))`, `(s) => s.x.map(...)`, `(s) => ({...})`). The snapshot identity changes every call, React re-renders, the selector runs again → infinite loop → **"Maximum update depth exceeded" → fatal crash in release builds** (unhandled JS exception takes the whole app down seconds after the screen mounts). Select the raw value and derive with `useMemo`. This nearly shipped in v1.1 build 74 (Explore screen `friendUids`); it crashed the app on every launch with a persisted session. Typecheck and code review did NOT catch it — only a runtime launch did.

## Mandatory pre-submission smoke test

Before EVERY store submission (no exceptions, even "metadata-only" code changes):
1. `npx eas-cli build --platform ios --profile production-simulator` → install the .app on a simulator (`xcrun simctl install <UUID> SyrenaVoyager.app`).
2. Launch with a SIGNED-IN session (not just the sign-in screen — most crashes need real data mounted), wait 30s.
3. Sweep all four tabs; open one place detail.
4. Check `~/Library/Logs/DiagnosticReports/` for new `SyrenaVoyager-*.ips` files and `log show --predicate 'process == "SyrenaVoyager" AND messageType == "Error"'` for `Unhandled JS Exception`.
Costs ~15 minutes; has now twice caught bugs that static checks missed.

## Submitting builds — EAS vs Transporter

`npx eas-cli submit --platform ios --id <build-id> --non-interactive` is the reliable path (no GUI). Transporter (the Mac app) works but its window fights for focus and can hang on "MAKING ITMSP". Only fall back to Transporter if Expo's submit service is degraded (check https://status.expo.dev). Marketing version in `app.json` must match an OPEN version train in App Store Connect (e.g. 1.1.0 while v1.1 is in Prepare for Submission) or Apple rejects the binary at upload with "Invalid Pre-Release Train."

## App Store Connect screenshots without drag-and-drop

The ASC screenshot uploader can be driven from the browser console (Claude-in-Chrome): host the images on https://syrena-travel.web.app/shots/ (CORS header configured in firebase.json), load each via `new Image()` + canvas → `File`, then set them on the `input[type=file][multiple]` via `DataTransfer` and dispatch `input`+`change`. Direct `fetch()` of the images is blocked by ASC's CSP; the canvas/img route works. Screenshots must be exactly 1284×2778 (6.5") or another accepted size.

## iPad

`app.json` has `"supportsTablet": false`. The app still runs on iPad (in scaled-up iPhone mode), but Apple no longer requires iPad-specific screenshots, and we don't have to worry about iPad-only layout regressions.

## Useful Firebase config

- Project ID: `syrena-travel`
- API key: `AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4`
- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`
- Hosting: https://syrena-travel.web.app (hosts the privacy policy at `/`)

## Privacy policy

Hosted at https://syrena-travel.web.app/. Source: `privacy-policy.html`. Re-deploy with:

```bash
cp privacy-policy.html public/index.html
npx firebase-tools deploy --only hosting --project syrena-travel --config firebase-hosting.json
```
