// Full-screen onboarding wrapper — no nav, no BottomNav
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-straw flex flex-col items-center justify-center px-5 py-12">
      {children}
    </div>
  )
}
