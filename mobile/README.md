# Service Desk AI Mobile

Android-first Expo application for Service Desk AI.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Start Expo:

```bash
npm start
```

For Android:

```bash
npm run android
```

## MVP scope

- Director login by phone and password.
- Approved `store_director` profile check.
- Approved director objects only.
- Director ticket list.
- Director ticket creation with `source = director_portal`.
- Basic acts/profile tabs.

Admin, worker, push notifications, photos, native builds and iOS polish are planned for later stages.
