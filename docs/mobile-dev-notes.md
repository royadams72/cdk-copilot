# Mobile Dev Notes

## Android Dev Client

Build and install the debug app from the repo root:

```bash
pnpm mobile:build:android:debug
pnpm mobile:install:android:debug
```

Start Metro and set up USB reverse for a connected Android phone:

```bash
pnpm core:build
pnpm mobile:reverse
pnpm mobile:dev
```

`pnpm core:build` is required because the mobile app imports `@ckd/core`, and Metro expects the built files under `packages/core/dist`.

## API Target

If you want the phone app to hit the deployed Vercel API during local development, set this in `apps/mobile/.env.local`:

```bash
EXPO_PUBLIC_API_URL=https://cdk-copilot-api.vercel.app
```

Then restart Metro:

```bash
pnpm mobile:dev
```

The env var is read at bundle time, so changing it requires a Metro restart.

## Warnings You Can Ignore For Now

Expo may log a URI scheme warning because `apps/mobile/app.json` defines multiple schemes. It currently uses `ckdapp`. That warning is not the bootstrap blocker.

Push notification setup may also log a Firebase initialization error on Android debug builds. That does not block normal app startup unless you are actively testing push notifications.

## Actual Bootstrap Blocker

If you see `Bootstrap [TypeError: Network request failed]`, the app usually cannot reach the API.

For a physical Android phone:

- `10.0.2.2` only works on the Android emulator.
- USB reverse is only useful when the app is meant to hit a localhost service on the Mac.
- If `EXPO_PUBLIC_API_URL` points at Vercel, USB reverse is not required for API access, though it is still useful for Metro on port `8081`.
