"use client";

interface TooltipProps {
  /** The help text to display */
  text: string;
  /** Optional title for the tooltip */
  title?: string;
  /** Position: where the tooltip appears */
  position?: "top" | "bottom" | "left" | "right";
  /** Size of the trigger circle */
  size?: "sm" | "md";
}

/**
 * Hover tooltip with a "?" trigger.
 * Shows a dark tooltip with explanation text on hover.
 */
export default function Tooltip({
  text,
  title,
  position = "bottom",
  size = "sm",
}: TooltipProps) {
  const sizeClasses = size === "sm" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full right-0 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<string, string> = {
    top: "absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-gray-900",
    bottom: "absolute -top-1 right-4 h-2 w-2 rotate-45 bg-gray-900",
    left: "absolute -right-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-gray-900",
    right: "absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-gray-900",
  };

  return (
    <div className="group relative inline-flex">
      <div
        className={`flex ${sizeClasses} items-center justify-center rounded-full bg-gray-200 font-bold text-gray-500 cursor-help transition-colors group-hover:bg-sky-200 group-hover:text-sky-700`}
      >
        ?
      </div>
      <div
        className={`absolute ${positionClasses[position]} z-50 hidden w-64 rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-200 shadow-xl group-hover:block`}
      >
        {title && <p className="mb-1 font-semibold text-white">{title}</p>}
        <p>{text}</p>
        <div className={arrowClasses[position]} />
      </div>
    </div>
  );
}
