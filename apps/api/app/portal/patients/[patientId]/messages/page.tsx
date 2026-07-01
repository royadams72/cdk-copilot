"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PortalPatientSubpageHeader } from "@/apps/api/app/portal/components/PortalPatientSubpageHeader";
import { usePortalAuthSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";
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
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Unable to notify patient");
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
    return <section className={styles.emptyState}>Loading messaging...</section>;
  }

  return (
    <section className={styles.detailLayout}>
      <PortalPatientSubpageHeader
        backHref={`/portal/patients/${params.patientId}`}
        backLabel="Back to patient"
        headline={`Message ${patientName}`}
      />
      {message ? <section className={styles.metaStrip}>{message}</section> : null}
      {error ? (
        <section className={styles.emptyState}>
          <p>{error}</p>
        </section>
      ) : null}
      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Send push notification</span>
        </div>
        <div className={styles.worseningModalList}>
          <label>
            <span className={styles.listHeaderMeta}>Title</span>
            <input
              className={styles.inputField}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label>
            <span className={styles.listHeaderMeta}>Message</span>
            <textarea
              className={styles.inputField}
              maxLength={240}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              value={body}
            />
          </label>
          <div className={styles.warningActions}>
            <button
              className={styles.buttonPrimarySmall}
              disabled={sending || !title.trim() || !body.trim()}
              onClick={() => void handleSend()}
              type="button"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
