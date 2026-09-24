/**
 * HandDrawnOverlay
 * A decorative, non-interactive layer of white hand-drawn doodles:
 * thin single-stroke lines, arrows, dotted guides, sparkles, hearts,
 * tiny faces, and short handwritten notes. Pointer-events disabled.
 */
export function HandDrawnOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none"
      style={{ color: "white" }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          opacity: 0.85,
          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.15))",
        }}
      >
        {/* wobbly outline hugging the hero */}
        <path
          d="M60,120 C 58,118 54,124 62,140 C 40,260 55,430 70,600 C 74,660 62,720 90,780"
          opacity="0.55"
        />
        <path
          d="M1380,110 C 1384,112 1378,130 1372,150 C 1394,300 1378,470 1360,640 C 1354,700 1372,760 1348,800"
          opacity="0.55"
        />

        {/* top-left note + arrow toward headline */}
        <g transform="translate(90,120)">
          <text
            fontFamily="Caveat, cursive"
            fontSize="26"
            fill="white"
            stroke="none"
            transform="rotate(-6)"
          >
            just breathe ✿
          </text>
          {/* dotted guide */}
          <path d="M40,40 C 120,70 220,80 320,90" strokeDasharray="2 6" />
          {/* arrow head */}
          <path d="M312,84 l14,8 l-10,6" />
          {/* tiny sparkle */}
          <path d="M10,-4 l0,10 M5,1 l10,0" opacity="0.9" />
        </g>

        {/* right-side sweet note near CTA */}
        <g transform="translate(1050,300)">
          <path d="M-40,-10 C 20,-30 90,-20 150,-8" strokeDasharray="1 5" />
          <path d="M148,-14 l10,6 l-8,8" />
          <text
            fontFamily="Caveat, cursive"
            fontSize="24"
            fill="white"
            stroke="none"
            transform="translate(160,4) rotate(4)"
          >
            you got this ♡
          </text>
        </g>

        {/* mid dotted swoop across features */}
        <path
          d="M120,560 C 380,520 620,600 900,540 S 1300,560 1380,600"
          strokeDasharray="1 7"
          opacity="0.7"
        />

        {/* handwritten header underline squiggle */}
        <path d="M480,220 C 560,214 660,232 820,220 S 980,214 1000,222" opacity="0.8" />

        {/* tiny hearts */}
        <g transform="translate(240,340)" strokeWidth="1.2">
          <path d="M0,4 C -6,-4 -14,2 -8,10 L 0,18 L 8,10 C 14,2 6,-4 0,4 Z" />
        </g>
        <g transform="translate(1200,700)" strokeWidth="1.2">
          <path d="M0,4 C -6,-4 -14,2 -8,10 L 0,18 L 8,10 C 14,2 6,-4 0,4 Z" />
        </g>

        {/* sparkles */}
        <g transform="translate(360,140)" strokeWidth="1.1">
          <path d="M0,-8 L0,8 M-8,0 L8,0 M-5,-5 L5,5 M-5,5 L5,-5" opacity="0.9" />
        </g>
        <g transform="translate(1120,180)" strokeWidth="1.1">
          <path d="M0,-6 L0,6 M-6,0 L6,0" />
        </g>
        <g transform="translate(700,760)" strokeWidth="1.1">
          <path d="M0,-7 L0,7 M-7,0 L7,0 M-4,-4 L4,4" opacity="0.85" />
        </g>

        {/* tiny steam curls (top) */}
        <path d="M760,60 C 764,50 756,44 762,34 C 768,26 758,20 764,12" opacity="0.75" />
        <path d="M790,70 C 794,60 786,54 792,44 C 798,36 788,30 794,22" opacity="0.6" />

        {/* smiley */}
        <g transform="translate(560,720)">
          <circle cx="0" cy="0" r="14" />
          <circle cx="-4" cy="-3" r="0.9" fill="white" stroke="none" />
          <circle cx="4" cy="-3" r="0.9" fill="white" stroke="none" />
          <path d="M-5,4 C -2,8 2,8 5,4" />
        </g>

        {/* corner note bottom-left */}
        <g transform="translate(90,820)">
          <text
            fontFamily="Caveat, cursive"
            fontSize="22"
            fill="white"
            stroke="none"
            transform="rotate(-3)"
          >
            small steps, big days ~
          </text>
          <path d="M0,10 C 80,-2 180,-2 260,6" opacity="0.7" />
        </g>

        {/* bottom-right whisper */}
        <g transform="translate(1140,820)">
          <text
            fontFamily="Caveat, cursive"
            fontSize="22"
            fill="white"
            stroke="none"
            transform="rotate(3)"
          >
            made with care ✧
          </text>
        </g>
      </svg>
    </div>
  );
}
