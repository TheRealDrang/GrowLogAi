interface Props {
  role: 'user' | 'assistant'
  content: string
  imagePreview?: string // base64 data URL, only present for current session
}

// Leaf icon for AI messages — botanical feel, not a robot
function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         className="w-4 h-4 text-moss flex-shrink-0 mt-0.5">
      <path d="M12 22V12" strokeLinecap="round"/>
      <path d="M12 12C12 12 7 8.5 7 4.5a5 5 0 0110 0C17 8.5 12 12 12 12z"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function ChatMessage({ role, content, imagePreview }: Props) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] space-y-1.5">
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Attached photo"
              className="rounded-2xl rounded-br-sm max-h-60 w-auto ml-auto shadow-card border border-straw-dark"
            />
          )}
          {content && (
            <div className="bg-straw border border-straw-dark text-soil rounded-2xl rounded-br-sm px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap font-sans shadow-card">
              {content}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sage/30 border border-sage/50 flex items-center justify-center mt-1">
        <LeafIcon />
      </div>
      <div className="max-w-[80%] bg-parchment border border-sage/30 text-soil rounded-2xl rounded-bl-sm px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap font-sans shadow-card">
        {content}
      </div>
    </div>
  )
}
