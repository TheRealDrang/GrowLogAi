interface Props {
  current: number
  total: number
  done?: boolean
}

export default function StepIndicator({ current, total, done }: Props) {
  return (
    <p className="text-xs font-sans text-bark/50 mb-5">
      Step {current} of {total}{done ? ' ✓' : ''}
    </p>
  )
}
