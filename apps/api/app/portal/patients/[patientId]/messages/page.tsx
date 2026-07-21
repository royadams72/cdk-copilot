"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
import { readResponseMessage } from "@/apps/api/lib/http/response-message";
import { getPortalSessionAuthHeaders } from "@/apps/api/lib/portal/session";

type PatientResponse = {
  data: {
    patient: { id: string; name: string };
  };
};

export default function PortalPatientMessagesPage() {
  const params = useParams<{ patientId: string }>();
  const { session, status } = usePortalAuthSession();
  const [patientName, setPatientName] = useState("Patient");
  const [title, setTitle] = useState("Check-in requested");
  const [body, setBody] = useState(
    "Your care team would like you to review your recent health information in CKD Copilot.",
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.patientId) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/portal/patients/${params.patientId}`, {
          headers: getPortalSessionAuthHeaders(session!.jwt),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as PatientResponse | null;
        if (response.ok && data && "data" in data) {
          setPatientName(data.data.patient.name);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [params.patientId, session, status]);

  async function handleSend() {
    if (!session) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/portal/patients/notify", {
        body: JSON.stringify({
          body: body.trim(),
          patientIds: [params.patientId],
          title: title.trim(),
        }),
        headers: {
          ...getPortalSessionAuthHeaders(session!.jwt),
          "content-type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(readResponseMessage(data, "Unable to notify patient"));
      }
      setMessage("Notification sent.");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to notify patient",
      );
    } finally {
      setSending(false);
    }
  }

  if (status === "loading" || loading) {
    return <PortalLoadingState label="Loading messaging..." />;
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline={`Notify ${patientName}`}
      />
      <div className={styles.carePlanFormIntro}>
        <h2 className={styles.carePlanFormTitle}>Notify patient</h2>
        <p className={styles.carePlanFormLead}>
          Send a single push notification to {patientName} from the care team.
        </p>
      </div>
      {message ? (
        <p className={styles.portalValidationSuccess} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className={styles.portalServerError} role="alert">
          {error}
        </p>
      ) : null}
      <section className={styles.panelSurface}>
        <form
          className={styles.portalFormShellWide}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <label className={styles.carePlanFormGroup}>
            <span className={styles.carePlanFieldLabel}>Title</span>
            <input
              className={styles.carePlanInput}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="E.g. Please review your recent readings"
              value={title}
            />
            <span className={styles.dataScreenCaption}>
              Up to 80 characters. Keep it short so it reads clearly in the
              notification tray.
            </span>
          </label>
          <label className={styles.carePlanFormGroup}>
            <span className={styles.carePlanFieldLabel}>Message</span>
            <textarea
              className={styles.carePlanTextarea}
              maxLength={240}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Explain what the patient should review or do next."
              rows={5}
              value={body}
            />
            <span className={styles.dataScreenCaption}>
              Up to 240 characters. The patient receives this as a push
              notification in the app.
            </span>
          </label>
          <div className={styles.portalActionRowEnd}>
            <button
              className={styles.buttonPrimarySmall}
              disabled={sending || !title.trim() || !body.trim()}
              type="submit"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
