"use client";

let recentErrors: string[] = [];

if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => String(a)).join(" ");
    recentErrors.push(msg.slice(0, 500));
    if (recentErrors.length > 10) recentErrors.shift();
    originalConsoleError.apply(console, args);
  };

  window.addEventListener("error", (event) => {
    recentErrors.push(`${event.message} at ${event.filename}:${event.lineno}`);
    if (recentErrors.length > 10) recentErrors.shift();
  });
}

export function getRecentErrors(): string[] {
  return [...recentErrors];
}

export function clearRecentErrors(): void {
  recentErrors = [];
}
