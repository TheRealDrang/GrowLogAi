import { redirect } from 'next/navigation'

// Old Apps Script guide retired — all onboarding starts at /onboarding/welcome
export default function OnboardingPage() {
  redirect('/onboarding/welcome')
}
