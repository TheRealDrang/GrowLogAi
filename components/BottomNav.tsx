'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import TooltipTip from './TooltipTip'

interface NavItem {
  href: string
  label: string
  active: boolean
  disabled: boolean
  icon: React.ReactNode
  tooltipId?: string
  tooltipMessage?: string
}

interface Props {
  gardenId?: string
  cropId?: string
}

export default function BottomNav({ gardenId, cropId }: Props) {
  const path = usePathname()

  const items: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Gardens',
      active: path === '/dashboard',
      disabled: false,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12h6v10" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: gardenId ? `/garden/${gardenId}` : '/dashboard',
      label: 'Crops',
      active: !!gardenId && path.startsWith('/garden/'),
      // Claude chose this approach because: no gardenId means there's no specific
      // crop list to navigate to — the button would just loop back to dashboard
      disabled: !gardenId,
      tooltipId: 'navigate-crops',
      tooltipMessage: 'Switch between crops to track each plant individually.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <path d="M12 22V12" strokeLinecap="round"/>
          <path d="M12 12C12 12 8 9 8 5a4 4 0 018 0c0 4-4 7-4 7z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: cropId ? `/crop/${cropId}` : '/dashboard',
      label: 'Chat',
      active: path.startsWith('/crop/'),
      // Claude chose this approach because: chat only makes sense within a specific
      // crop — without a cropId there's no conversation to navigate to
      disabled: !cropId,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: '/settings',
      label: 'Settings',
      active: path === '/settings',
      disabled: false,
      tooltipId: 'navigate-settings',
      tooltipMessage: 'Settings lets you manage your garden, members, and Google Sheets connection.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <circle cx="12" cy="12" r="3" strokeLinecap="round"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-soil-deep safe-area-pb">
      <div className="flex items-stretch h-16">
        {items.map(item => {
          // Claude chose this approach because: wrapping each item in a relative div lets
          // TooltipTip placement="above" position itself above the nav bar without needing
          // a portal — absolute children of a fixed element are still positioned relative to it.
          const itemClass = `flex flex-col items-center justify-center gap-0.5 min-h-[48px] w-full`
          const content = (
            <>
              <span className={`transition-transform ${item.active ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-sans font-medium tracking-wide">
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-parchment rounded-t-full" />
              )}
            </>
          )

          const inner = item.disabled ? (
            <span
              className={`${itemClass} text-parchment/20 cursor-default`}
              aria-disabled="true"
            >
              {content}
            </span>
          ) : (
            <Link
              href={item.href}
              className={`${itemClass} transition-colors ${
                item.active ? 'text-parchment' : 'text-parchment/40 hover:text-parchment/70'
              }`}
            >
              {content}
            </Link>
          )

          return (
            <div key={item.label} className="flex-1 relative flex flex-col">
              {item.tooltipId && (
                <TooltipTip
                  tooltipId={item.tooltipId}
                  message={item.tooltipMessage!}
                  placement="above"
                />
              )}
              {inner}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
