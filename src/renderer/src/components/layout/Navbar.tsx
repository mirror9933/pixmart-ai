import { Link, useLocation } from 'react-router-dom'
import { Bell, Settings } from 'lucide-react'
import ThemeToggle from '@/components/ui/ThemeToggle'

const navItems = [
  { path: '/', label: '全品类商品图' },
  { path: '/style-replication', label: '风格复刻' },
  { path: '/project-history', label: '项目记录' },
]

export function Navbar() {
  const location = useLocation()

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <svg width="128" height="128" viewBox="0 0 800 800" style={{ color: 'var(--brand)' }}>
              <g transform="translate(0,800) scale(0.1,-0.1)" fill="currentColor" stroke="none">
                <path d="M2258 4529 c-46 -24 -68 -64 -68 -122 0 -129 182 -176 250 -64 41 67 16 158 -53 190 -45 22 -83 21 -129 -4z"/>
                <path d="M1320 4408 l-25 -14 -3 -409 c-3 -485 -14 -445 127 -445 124 0 131 7 131 119 l0 88 128 6 c148 6 206 21 282 75 161 112 183 351 43 483 -88 84 -152 100 -433 105 -175 4 -231 2 -250 -8z m443 -212 c45 -19 68 -48 74 -94 12 -92 -50 -136 -192 -137 l-90 0 -3 123 -3 122 91 0 c54 0 104 -5 123 -14z"/>
                <path d="M6260 4351 c-5 -11 -10 -49 -10 -85 l0 -66 -50 0 c-60 0 -70 -14 -70 -99 0 -74 14 -91 76 -91 l44 0 0 -128 c0 -166 14 -217 79 -282 51 -51 107 -72 195 -72 87 0 179 36 192 74 3 10 -9 44 -28 80 -35 67 -45 72 -109 54 -18 -5 -32 -2 -50 12 -23 19 -24 27 -28 141 l-3 121 70 0 c86 0 102 15 102 98 0 85 -8 92 -95 92 l-75 0 0 73 c0 43 -5 78 -12 85 -8 8 -48 12 -115 12 -91 0 -103 -2 -113 -19z"/>
                <path d="M3757 4236 c-27 -7 -61 -22 -76 -33 l-27 -21 -17 29 c-16 29 -17 29 -111 29 -73 0 -98 -4 -110 -16 -14 -13 -16 -58 -16 -334 0 -377 -10 -350 127 -350 124 0 123 -2 123 210 0 133 3 178 16 210 19 47 55 70 109 70 91 0 105 -34 105 -268 0 -138 3 -183 14 -198 12 -16 29 -20 104 -22 133 -6 132 -8 132 208 0 133 3 178 16 210 36 90 159 99 199 15 12 -26 15 -71 15 -212 0 -223 -3 -217 114 -222 68 -2 92 0 112 14 l25 16 -3 232 c-3 217 -4 235 -26 282 -30 65 -73 108 -136 137 -42 19 -67 23 -141 22 -98 -1 -153 -18 -211 -67 l-31 -26 -24 26 c-54 58 -186 86 -282 59z"/>
                <path d="M4970 4243 c-40 -7 -122 -34 -162 -55 -29 -14 -38 -24 -38 -44 0 -31 59 -132 81 -139 9 -3 38 5 65 17 68 30 190 32 230 3 15 -11 31 -31 35 -43 8 -22 8 -22 -104 -22 -176 0 -269 -33 -318 -114 -24 -39 -26 -134 -3 -182 37 -78 139 -134 244 -134 52 0 141 24 177 47 21 14 23 14 23 -1 0 -24 41 -36 124 -36 109 0 106 -8 106 257 0 140 -4 232 -12 254 -32 94 -109 160 -217 185 -53 13 -175 16 -231 7z m218 -450 c2 -13 -8 -34 -26 -54 -24 -27 -37 -33 -84 -37 -47 -4 -59 -1 -77 17 -29 29 -25 71 9 88 15 8 54 12 100 11 68 -3 75 -5 78 -25z"/>
                <path d="M5946 4235 c-22 -8 -52 -23 -67 -34 -34 -26 -39 -26 -39 -3 0 35 -21 42 -120 42 -81 0 -100 -3 -113 -18 -15 -16 -17 -55 -17 -335 0 -374 -10 -347 130 -347 129 0 124 -8 130 208 5 163 7 183 26 209 38 51 81 73 145 73 l59 0 0 98 c0 63 -4 102 -12 110 -16 16 -73 15 -122 -3z"/>
                <path d="M2212 4228 c-9 -9 -12 -97 -12 -334 0 -280 2 -325 16 -338 12 -12 37 -16 105 -16 138 0 129 -24 129 353 0 375 11 347 -131 347 -61 0 -99 -4 -107 -12z"/>
                <path d="M2576 4219 c-8 -12 -12 -29 -9 -38 6 -15 106 -152 172 -235 17 -21 31 -45 31 -53 0 -8 -43 -71 -96 -141 -121 -159 -126 -168 -95 -193 19 -15 40 -19 111 -19 103 0 118 8 180 100 22 32 44 61 48 64 5 3 32 -28 61 -69 28 -41 60 -79 71 -85 10 -5 61 -10 113 -10 78 0 97 3 110 18 10 10 17 25 17 32 0 7 -46 74 -102 149 -57 74 -106 141 -110 147 -5 7 36 70 102 160 102 136 109 149 96 168 -12 19 -25 21 -119 24 l-106 3 -58 -80 c-32 -44 -61 -81 -64 -81 -4 0 -21 21 -37 48 -17 26 -45 62 -63 80 l-31 32 -104 0 c-93 0 -104 -2 -118 -21z"/>
              </g>
            </svg>
          </Link>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            className="hidden md:flex"
          >
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="anim-nav-link"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '14px',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--brand)' : 'var(--fg-muted)',
                    backgroundColor: isActive ? 'var(--brand-glow)' : 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            style={{
              position: 'relative',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            aria-label="通知"
          >
            <Bell size={20} />
            <span
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                border: '2px solid var(--bg-surface)',
              }}
            />
          </button>

          <Link
            to="/settings"
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              color: 'var(--fg-muted)',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            aria-label="设置"
          >
            <Settings size={20} />
          </Link>

          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

export default Navbar
