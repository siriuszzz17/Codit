"use client";

import { useEffect } from "react";
import { setProblemDetailsObserver } from "@/lib/problem-details";
import {
  installGlobalErrorHandlers,
  reportProblemDetails,
} from "@/lib/telemetry/error-reporter";

export function GlobalErrorObserver() {
  useEffect(() => {
    setProblemDetailsObserver((problem) => {
      void reportProblemDetails(problem);
    });
    const uninstall = installGlobalErrorHandlers();

    return () => {
      uninstall();
      setProblemDetailsObserver(null);
    };
  }, []);

  return null;
}
