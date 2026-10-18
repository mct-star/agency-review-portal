/** Decorative idea-to-post sequence. The unanimated SVG is the finished composition. */
export default function WelcomeMotion() {
  return (
    <div className="workspace-welcome-art" aria-hidden="true">
      <svg width="270" height="170" viewBox="0 0 280 176" fill="none" focusable="false">
        <path className="welcome-thread" pathLength="1" strokeDasharray="1" d="M8 133C43 145 22 8 88 9C145 10 109 159 167 158C218 157 248 118 270 137" stroke="#B99AEF" strokeWidth="2" strokeLinecap="round" />
        <g transform="translate(20 32) rotate(-3 42 54)">
          <g className="welcome-paper-idea">
            <rect width="86" height="108" rx="9" fill="#E9DCFF" />
            <path d="m22 40 3-11 22-17 8 9-22 17-11 2Zm20-24 8 9M18 54h35M18 63h48M18 72h39M18 88h20" stroke="#68468E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
        <g transform="translate(91 17) rotate(2 43 56)">
          <g className="welcome-paper-plan">
            <rect width="86" height="112" rx="9" fill="#D8EBE4" />
            <rect x="15" y="16" width="56" height="12" rx="3" fill="#B9DACE" />
            <g className="welcome-plan-row-one"><path d="M15 42h56" stroke="#4C806C" strokeWidth="1.5" /><rect x="16" y="48" width="12" height="10" rx="2" fill="#AE8ED8" /><path d="M36 53h31" stroke="#4C806C" strokeWidth="1.5" strokeLinecap="round" /></g>
            <g className="welcome-plan-row-two"><path d="M15 65h56" stroke="#4C806C" strokeWidth="1.5" /><rect x="16" y="71" width="12" height="10" rx="2" fill="#7BAB95" /><path d="M36 76h24" stroke="#4C806C" strokeWidth="1.5" strokeLinecap="round" /></g>
            <g className="welcome-plan-row-three"><path d="M15 88h56" stroke="#4C806C" strokeWidth="1.5" /><rect x="16" y="94" width="12" height="10" rx="2" fill="#D4AE7F" /><path d="M36 99h28" stroke="#4C806C" strokeWidth="1.5" strokeLinecap="round" /></g>
          </g>
        </g>
        <g transform="translate(156 37) rotate(-2 54 66)">
          <g className="welcome-paper-post">
            <rect className="welcome-paper-shadow" x="3" y="5" width="108" height="130" rx="10" fill="#21152E" fillOpacity=".2" />
            <rect width="108" height="130" rx="10" fill="#FFFEFA" />
            <circle cx="19" cy="18" r="7" fill="#B99AEF" />
            <path d="M33 15h41M33 21h28" stroke="#81728B" strokeWidth="2" strokeLinecap="round" />
            <g className="welcome-post-image"><rect x="12" y="34" width="84" height="49" rx="5" fill="#F4DFC3" /><path d="M32 62h44M41 54h26" stroke="#8A633D" strokeWidth="3" strokeLinecap="round" /></g>
            <path className="welcome-post-copy" d="M13 96h81M13 103h72M13 110h49" stroke="#A79BAB" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
