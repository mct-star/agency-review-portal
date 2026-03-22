"use client";

/**
 * Phone Mockup Frame
 *
 * Wraps content (typically a LinkedInPreview) inside a realistic
 * phone outline for use in compliance reports and presentation views.
 *
 * Matches the Ski Funnel Creative PDF format:
 * ┌──────────────────┐
 * │  ┌──────────────┐│
 * │  │ ●●● Status   ││  ← Phone status bar
 * │  │              ││
 * │  │  LinkedIn    ││  ← App header
 * │  │  Feed Post   ││
 * │  │              ││
 * │  │  [Image]     ││
 * │  │              ││
 * │  │  Reactions   ││
 * │  └──────────────┘│
 * │      ───────      │  ← Home indicator
 * └──────────────────┘
 */

interface PhoneMockupProps {
  children: React.ReactNode;
  /** Phone frame width (default 320px) */
  width?: number;
  /** Device type affects the frame style */
  device?: "iphone" | "android";
}

export default function PhoneMockup({
  children,
  width = 320,
  device = "iphone",
}: PhoneMockupProps) {
  const borderRadius = device === "iphone" ? 40 : 24;
  const innerRadius = device === "iphone" ? 32 : 16;

  return (
    <div
      className="relative mx-auto"
      style={{ width, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Phone frame */}
      <div
        className="bg-gray-900 shadow-2xl"
        style={{
          borderRadius,
          padding: "12px 8px",
        }}
      >
        {/* Dynamic Island / Notch */}
        {device === "iphone" && (
          <div className="flex justify-center mb-2">
            <div className="h-[22px] w-[90px] bg-black rounded-full" />
          </div>
        )}

        {/* Screen */}
        <div
          className="bg-white overflow-hidden"
          style={{
            borderRadius: innerRadius,
            maxHeight: width * 1.8,
            overflowY: "auto",
          }}
        >
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 py-1.5 bg-white">
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="flex items-center gap-1">
              {/* Signal */}
              <svg width="14" height="10" viewBox="0 0 14 10" fill="#1a1a1a">
                <rect x="0" y="7" width="2.5" height="3" rx="0.5" />
                <rect x="3.5" y="5" width="2.5" height="5" rx="0.5" />
                <rect x="7" y="3" width="2.5" height="7" rx="0.5" />
                <rect x="10.5" y="0" width="2.5" height="10" rx="0.5" />
              </svg>
              {/* WiFi */}
              <svg width="12" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <circle cx="12" cy="20" r="1" fill="#1a1a1a" />
              </svg>
              {/* Battery */}
              <svg width="20" height="10" viewBox="0 0 25 10" fill="none">
                <rect x="0" y="0" width="21" height="10" rx="2" stroke="#1a1a1a" strokeWidth="1.5" />
                <rect x="2" y="2" width="15" height="6" rx="1" fill="#34D399" />
                <rect x="22" y="3" width="2" height="4" rx="0.5" fill="#1a1a1a" />
              </svg>
            </div>
          </div>

          {/* LinkedIn app bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </div>
            <div className="flex-1 mx-2">
              <div className="bg-gray-100 rounded-md px-3 py-1">
                <span style={{ fontSize: 11, color: "#666" }}>Search</span>
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
            </svg>
          </div>

          {/* Post content */}
          <div className="pb-2">
            {children}
          </div>
        </div>

        {/* Home indicator */}
        {device === "iphone" && (
          <div className="flex justify-center mt-2">
            <div className="h-[4px] w-[100px] bg-gray-600 rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}
