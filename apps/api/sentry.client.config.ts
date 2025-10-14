import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, // if you expose it client-side
  environment: process.env.SENTRY_ENVIRONMENT,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  // Optional: redact URLs, form fields, etc.
  beforeSend(event) {
    return event;
  },
});
