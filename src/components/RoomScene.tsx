/** Quiet fitting room shown when no camera is on: wall, arched mirror, rail, window light. */
export function RoomScene() {
  return (
    <svg className="room" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-testid="room-placeholder">
      <defs>
        <linearGradient id="room-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1215" />
          <stop offset=".72" stopColor="#111a1d" />
          <stop offset="1" stopColor="#0d1417" />
        </linearGradient>
        <linearGradient id="room-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141d20" />
          <stop offset="1" stopColor="#090d0f" />
        </linearGradient>
        <linearGradient id="room-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c2a2d" />
          <stop offset=".5" stopColor="#121c1f" />
          <stop offset="1" stopColor="#0d1518" />
        </linearGradient>
        <linearGradient id="room-window" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c3f43" />
          <stop offset="1" stopColor="#152023" />
        </linearGradient>
        <linearGradient id="room-spill" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#6d9a9c" stopOpacity=".14" />
          <stop offset="1" stopColor="#6d9a9c" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="room-pool" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#3f6a6a" stopOpacity=".28" />
          <stop offset="1" stopColor="#3f6a6a" stopOpacity="0" />
        </radialGradient>
        <filter id="room-blur" filterUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#room-wall)" />
      <path d="M0 800H1600V1000H0Z" fill="url(#room-floor)" />
      <path d="M0 800H1600" stroke="#2a393c" strokeWidth="1" />
      <path d="M0 776H1600" stroke="#1d2a2d" strokeWidth="6" />

      {/* Window, far left, with its light across the wall */}
      <g>
        <path d="M84 150H320V640H84Z" fill="url(#room-window)" />
        <path d="M202 150V640M84 312H320M84 476H320" stroke="#0c1215" strokeWidth="6" />
        <path d="M84 150H320V640H84Z" fill="none" stroke="#2f4144" strokeWidth="2" />
        <path d="M320 150L900 800H360L84 640Z" fill="url(#room-spill)" />
      </g>

      {/* Arched mirror, centred behind the garment */}
      <g>
        <path d="M520 800V360C520 186 644 84 800 84C956 84 1080 186 1080 360V800Z" fill="url(#room-glass)" />
        <path d="M520 800V360C520 186 644 84 800 84C956 84 1080 186 1080 360V800" fill="none" stroke="#3a4f52" strokeWidth="2" />
        <path d="M534 800V362C534 198 652 98 800 98C948 98 1066 198 1066 362V800" fill="none" stroke="#1e2c2f" strokeWidth="1.5" />
        <path d="M600 800L900 104L980 130L700 800Z" fill="#9fd0cc" fillOpacity=".022" />
      </g>
      <ellipse cx="800" cy="842" rx="470" ry="62" fill="url(#room-pool)" />

      {/* Clothes rail, right */}
      <g filter="url(#room-blur)" opacity=".85">
        <path d="M1230 240H1560M1244 240V800M1546 240V800" stroke="#2c3b3e" strokeWidth="6" fill="none" />
        <g fill="#172225" stroke="#26363a" strokeWidth="1.5">
          <path d="M1290 240C1290 262 1312 262 1312 276L1276 300L1262 560H1362L1348 300L1312 276" />
          <path d="M1384 240C1384 262 1406 262 1406 276L1366 304L1356 640H1456L1446 304L1406 276" />
          <path d="M1486 240C1486 262 1508 262 1508 276L1474 300L1468 520H1548L1542 300L1508 276" />
        </g>
      </g>

      {/* Stool, left of the mirror */}
      <g filter="url(#room-blur)" opacity=".8">
        <ellipse cx="402" cy="694" rx="62" ry="13" fill="#1a2629" stroke="#2c3c3f" strokeWidth="1.5" />
        <path d="M356 700L340 860M448 700L464 860M402 708V874" stroke="#22303a" strokeWidth="5" />
      </g>
    </svg>
  );
}
