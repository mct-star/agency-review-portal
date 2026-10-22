/**
 * Under 768 px the floating help button is hidden (it sat on top of the
 * primary action at the bottom right) and the top bar carries a Help button
 * instead. The top bar fires this window event; the widget opens its panel.
 */
export const OPEN_HELP_EVENT = "agency:open-help";

/** Below this width the layout is the phone layout. Matches Tailwind's md. */
export const DESKTOP_MIN_WIDTH_QUERY = "(min-width: 768px)";
