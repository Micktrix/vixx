"use client";

// Sidste udvej, hvis selve rammen om appen fejler. Kan ikke bruge appens layout eller styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="da">
      <body style={{ fontFamily: "Helvetica, Arial, sans-serif", background: "#f5f4f2", color: "#262422", padding: 24 }}>
        <h1>Noget gik galt</h1>
        <p>Vixx kunne ikke vises. Prøv igen om lidt.</p>
        {error.digest && <p style={{ fontSize: 13, color: "#716c66" }}>Reference: {error.digest}</p>}
        <button type="button" onClick={reset} style={{ padding: "10px 16px", background: "#dd7434", border: 0, borderRadius: 10, fontWeight: 700 }}>
          Prøv igen
        </button>
      </body>
    </html>
  );
}
