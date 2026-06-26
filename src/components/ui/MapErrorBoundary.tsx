"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("MapErrorBoundary caught:", error, info.componentStack);
  }

  private buildMailtoHref(): string {
    const subject = encodeURIComponent("Bug Report — OpenCanopy (crash)");
    const body = encodeURIComponent(
      [
        `The map crashed with error:`,
        this.state.error?.message ?? "Unknown error",
        "",
        `URL: ${typeof window !== "undefined" ? window.location.href : ""}`,
      ].join("\n")
    );
    return `mailto:opencanopymap@gmail.com?subject=${subject}&body=${body}`;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0c]">
          <div role="alert" className="mx-4 max-w-md w-full p-8 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-12 h-12 mx-auto mb-4 text-amber-400"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>

            <h2 className="text-lg font-semibold text-zinc-200 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              The map encountered an error and couldn&apos;t recover.
            </p>

            <button
              autoFocus
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors text-sm font-medium focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Reload map
            </button>

            <div className="mt-4">
              <a
                href={this.buildMailtoHref()}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
              >
                Report this issue
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
