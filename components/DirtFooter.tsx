export default function DirtFooter() {
  return (
    <div className="w-full mt-auto">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 140"
        preserveAspectRatio="none"
        width="100%"
        height="140"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        {/* Top soil layer — wavy organic surface */}
        <path d="M0 62 Q80 50 160 60 Q240 70 320 55 Q400 42 480 56 Q560 68 640 54 Q720 44 800 58 L800 140 L0 140 Z" fill="#8B5E3C"/>
        {/* Mid soil layer */}
        <path d="M0 85 Q160 76 320 83 Q480 90 640 80 Q720 76 800 82 L800 140 L0 140 Z" fill="#6B3E22"/>
        {/* Deep soil layer */}
        <path d="M0 108 Q200 100 400 106 Q600 112 800 103 L800 140 L0 140 Z" fill="#4A2E14"/>

        {/* Pebbles */}
        <ellipse cx="120" cy="76" rx="9" ry="5.5" fill="#A57048" opacity="0.7"/>
        <ellipse cx="290" cy="88" rx="7" ry="4" fill="#8B5238" opacity="0.6"/>
        <ellipse cx="480" cy="70" rx="10" ry="5" fill="#A57048" opacity="0.65"/>
        <ellipse cx="650" cy="80" rx="6" ry="3.5" fill="#8B5238" opacity="0.55"/>
        <ellipse cx="380" cy="96" rx="8" ry="4.5" fill="#7A4228" opacity="0.5"/>
        <ellipse cx="730" cy="72" rx="5" ry="3" fill="#A57048" opacity="0.6"/>

        {/* Roots — left sprout */}
        <path d="M175 62 L172 85 L162 108" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M172 85 L185 100" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>
        {/* Roots — center sprout */}
        <path d="M400 55 L398 80 L388 105" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M398 80 L412 95" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>
        {/* Roots — right sprout */}
        <path d="M628 56 L626 82 L614 106" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M626 82 L638 96" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>

        {/* Earthworm */}
        <path d="M300 90 Q322 78 344 90 Q366 102 388 88" stroke="#C47840" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
        <circle cx="300" cy="90" r="5" fill="#C47840"/>
        <circle cx="300" cy="90" r="2" fill="#A05A28"/>

        {/* Sprout 1 — left */}
        <line x1="175" y1="62" x2="175" y2="18" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M175 32 Q158 22 153 29 Q158 38 175 36" fill="#4A6741"/>
        <path d="M175 46 Q192 36 197 43 Q192 52 175 50" fill="#5C7F52"/>

        {/* Sprout 2 — center, tallest */}
        <line x1="400" y1="55" x2="400" y2="6" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M400 20 Q382 10 377 18 Q382 27 400 25" fill="#4A6741"/>
        <path d="M400 34 Q418 24 423 32 Q418 41 400 39" fill="#5C7F52"/>
        <path d="M400 10 Q388 2 384 8 Q387 15 400 13" fill="#3A5233"/>

        {/* Sprout 3 — right */}
        <line x1="628" y1="56" x2="628" y2="14" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M628 27 Q611 18 606 25 Q611 34 628 31" fill="#4A6741"/>
        <path d="M628 42 Q645 33 650 40 Q645 49 628 46" fill="#5C7F52"/>
      </svg>
      {/* Solid soil-deep bar extending the bottom */}
      <div className="bg-soil-deep h-6" />
    </div>
  )
}
