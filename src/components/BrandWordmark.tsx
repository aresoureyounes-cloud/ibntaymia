export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <div className="h-8 w-2 rounded-full bg-secondary shadow-sm shadow-secondary/40" />
      <div className="relative">
        <span
          className="font-script text-3xl text-primary logo-shadow"
          style={{ fontFamily: "'Playwrite BE VLG', 'Caveat', cursive" }}
        >
          Idaroom
        </span>
        <svg
          className="absolute -bottom-1 left-0 h-3 w-full overflow-visible"
          viewBox="0 0 160 12"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="animate-draw"
            d="M2 8 C 40 2, 80 12, 158 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
