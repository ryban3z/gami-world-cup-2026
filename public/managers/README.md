# Manager photos

Drop each manager's photo here, then point their `profiles.avatar_url` at it via
`supabase/seed/0019_manager_avatars.sql`.

**Convention**

- Filename: lowercase slug of the display name, e.g. `hans.jpg`, `tallon-dor.jpg`.
- `avatar_url` value: the public path, e.g. `/managers/hans.jpg` (leading slash, no `public/`).
- Square images work best — they're rendered as a 64px circle (`object-cover`), so
  anything roughly square crops cleanly. ~256×256+ keeps it crisp on retina screens.
- `.jpg`, `.png`, or `.webp` all fine.

Managers without a photo fall back to their initials in a circle — no photo is required.
