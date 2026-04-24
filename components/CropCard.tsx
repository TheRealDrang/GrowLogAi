import Link from 'next/link'

interface Props {
  crop: {
    id: string
    name: string
    variety?: string | null
    bed_location?: string | null
    sow_date?: string | null
    status: string
  }
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; border: string }> = {
  growing:   { label: 'Growing',   dot: 'bg-moss',    border: 'border-l-moss' },
  harvested: { label: 'Harvested', dot: 'bg-harvest', border: 'border-l-harvest' },
  failed:    { label: 'Failed',    dot: 'bg-soil/50', border: 'border-l-soil/40' },
}

export default function CropCard({ crop }: Props) {
  const cfg = STATUS_CONFIG[crop.status] ?? STATUS_CONFIG.growing
  const days = crop.sow_date ? daysSince(crop.sow_date) : null

  return (
    <Link
      href={`/crop/${crop.id}`}
      className={`block bg-parchment rounded-card shadow-card hover:shadow-card-hover transition-all
                  border-l-4 ${cfg.border} active:scale-[0.98]`}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="font-serif text-base font-semibold text-soil leading-tight truncate">
              {crop.name}
            </h3>
            {crop.variety && (
              <p className="text-xs text-bark mt-0.5 truncate">{crop.variety}</p>
            )}
          </div>
          <span className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-sans font-medium text-bark`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-sage/20">
          {crop.bed_location ? (
            <span className="text-xs text-bark/70 truncate">{crop.bed_location}</span>
          ) : (
            <span />
          )}
          {days !== null ? (
            <span className="font-mono text-xs text-bark/60">Day {days}</span>
          ) : null}
        </div>

        {/* CTA */}
        <p className="text-xs text-moss font-sans font-medium mt-2">
          Open diary →
        </p>
      </div>
    </Link>
  )
}
