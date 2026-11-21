"use client";

import { useEffect, useRef } from "react";

// Efter gem står telefonen ofte nederst ved knappen; rul beskeden "✓ … er bekræftet" ind i billedet.
export function ScrollToTop({ trigger }: { trigger: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [trigger]);
  return <span ref={ref} hidden />;
}
