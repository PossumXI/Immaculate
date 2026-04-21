"use client";

import { useState, type FormEvent } from "react";

export function DashboardLogin() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);

    try {
      const response = await fetch("/api/operator/session", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          password
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.message ?? payload?.error ?? "Unable to authenticate dashboard operator session."
        );
      }

      window.location.reload();
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Unable to authenticate dashboard operator session."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background:
          "radial-gradient(circle at top, rgba(38,90,148,0.22), transparent 42%), #07111c",
        color: "#e8eef5"
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(28rem, 100%)",
          display: "grid",
          gap: "0.9rem",
          padding: "1.5rem",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          borderRadius: "18px",
          background: "rgba(6, 16, 28, 0.92)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)"
        }}
      >
        <div style={{ display: "grid", gap: "0.35rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Operator Sign-In</h1>
          <p style={{ margin: 0, color: "#a9b7c7", lineHeight: 1.5 }}>
            The dashboard now proxies harness access through a server-side operator session.
          </p>
        </div>

        <label style={{ display: "grid", gap: "0.45rem" }}>
          <span style={{ fontSize: "0.95rem", color: "#dbe6f2" }}>Operator credential</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              width: "100%",
              padding: "0.8rem 0.9rem",
              borderRadius: "12px",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "rgba(15, 23, 42, 0.84)",
              color: "#f8fafc"
            }}
          />
        </label>

        {errorText ? (
          <div
            style={{
              borderRadius: "12px",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              background: "rgba(127, 29, 29, 0.18)",
              color: "#fecaca",
              padding: "0.8rem 0.9rem"
            }}
          >
            {errorText}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || password.trim().length === 0}
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "999px",
            border: "none",
            background: submitting ? "#52667e" : "#f59e0b",
            color: "#101826",
            fontWeight: 700,
            cursor: submitting ? "progress" : "pointer"
          }}
        >
          {submitting ? "Authorizing..." : "Open Dashboard"}
        </button>
      </form>
    </main>
  );
}
