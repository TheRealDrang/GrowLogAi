'use client'

import { useState, useRef, useEffect } from 'react'
import ChatMessage from '@/components/ChatMessage'

interface Message {
  role: 'user' | 'assistant'
  content: string
  imagePreview?: string
}

interface AttachedImage {
  data: string       // base64 without prefix
  mediaType: string  // always image/jpeg after resize
  preview: string    // data URL for display
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SessionLog {
  id: string
  log_date: string
  observation: string | null
  ai_advice: string | null
  sheet_posted: boolean
}

interface Props {
  cropId: string
  initialHistory: Message[]
  sessionLogs: SessionLog[]
  cropName: string
  sowDate?: string | null
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json[\s\S]*?```\s*$/g, '').trimEnd()
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// Contextual starter questions based on crop age
function getStarters(cropName: string, sowDate: string | null | undefined): string[] {
  const days = sowDate ? daysSince(sowDate) : null

  if (!days || days < 7) return [
    `What should I watch for in the first week with my ${cropName}?`,
    `Is there anything I should do right after planting ${cropName}?`,
    `What watering schedule works best for ${cropName}?`,
  ]
  if (days < 30) return [
    `My ${cropName} is ${days} days old — how is it doing for this stage?`,
    `Are there pests I should watch for right now with ${cropName}?`,
    `How often should I be watering my ${cropName} this time of year?`,
  ]
  return [
    `My ${cropName} is ${days} days in — what should I be watching for now?`,
    `Any signs I should harvest my ${cropName} soon?`,
    `What's the best way to encourage more growth in my ${cropName}?`,
  ]
}

export default function CropChatClient({ cropId, initialHistory, sessionLogs, cropName, sowDate }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialHistory)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsWidth, setLogsWidth] = useState(320)
  const [logSearch, setLogSearch] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [supportsVoice, setSupportsVoice] = useState(false)
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const startInputRef = useRef('')

  const hasLogs = sessionLogs.length > 0

  const starters = getStarters(cropName, sowDate)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  useEffect(() => {
    setSupportsVoice('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop()
      return // onend will setIsListening(false)
    }

    // Claude chose this approach because: Web Speech API is free, built-in, and requires no API keys
    const w = window as unknown as Record<string, unknown>
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | undefined
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true

    startInputRef.current = input // preserve any text already typed

    recognition.onresult = (event: Event) => {
      const e = event as Event & { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript
      }
      const prefix = startInputRef.current
      setInput((prefix ? prefix + ' ' : '') + transcript)
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setLogsWidth(Math.max(200, Math.min(520, rect.right - e.clientX)))
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function resizeImage(file: File): Promise<AttachedImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const MAX = 1024
          let { width, height } = img
          if (width > MAX || height > MAX) {
            const ratio = Math.min(MAX / width, MAX / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          const preview = canvas.toDataURL('image/jpeg', 0.85)
          resolve({ data: preview.split(',')[1], mediaType: 'image/jpeg', preview })
        }
        img.onerror = reject
        img.src = e.target!.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so same file can be re-selected
    try {
      const resized = await resizeImage(file)
      setAttachedImage(resized)
    } catch {
      // silently ignore — if resize fails, no image attached
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim()
    if ((!msg && !attachedImage) || streaming) return

    const imageToSend = attachedImage
    setInput('')
    setAttachedImage(null)
    setMessages(prev => [...prev, {
      role: 'user',
      content: msg,
      imagePreview: imageToSend?.preview,
    }])
    setStreaming(true)
    setStreamBuffer('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop_id: cropId,
          message: msg,
          image: imageToSend ? { data: imageToSend.data, mediaType: imageToSend.mediaType } : undefined,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Failed to get response')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamBuffer(stripJsonBlock(full))
      }

      setMessages(prev => [...prev, { role: 'assistant', content: stripJsonBlock(full) }])
      setStreamBuffer('')
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Something went wrong on my end — please try sending that again." },
      ])
      setStreamBuffer('')
    } finally {
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    // This div fills remaining height — chat scrolls inside, input stays at bottom
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Scrollable messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-w-3xl mx-auto w-full pb-[280px] md:pb-5">

          {/* Empty state with starters */}
          {messages.length === 0 && !streaming && (
            <div className="pt-8 pb-4">
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-sage/20 border border-sage/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                       className="w-6 h-6 text-moss">
                    <path d="M12 22V12" strokeLinecap="round"/>
                    <path d="M12 12C12 12 7 8 7 4.5a5 5 0 0110 0C17 8 12 12 12 12z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="font-serif text-lg text-soil">Your diary starts here.</p>
                <p className="text-bark text-sm font-sans mt-1 max-w-xs mx-auto">
                  Ask about anything — watering, pests, harvest timing, what you observed today.
                </p>
              </div>

              {/* Starter questions */}
              <div className="space-y-2">
                {starters.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left text-sm font-sans text-soil bg-parchment hover:bg-straw-dark
                               border border-sage/30 hover:border-sage rounded-xl px-4 py-3 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} imagePreview={msg.imagePreview} />
          ))}

          {/* Streaming response */}
          {streaming && streamBuffer && (
            <ChatMessage role="assistant" content={streamBuffer} />
          )}

          {/* Thinking state */}
          {streaming && !streamBuffer && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-sage/30 border border-sage/50 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                     className="w-3.5 h-3.5 text-moss">
                  <path d="M12 22V12" strokeLinecap="round"/>
                  <path d="M12 12C12 12 7 8 7 4.5a5 5 0 0110 0C17 8 12 12 12 12z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="bg-parchment border border-sage/30 rounded-2xl rounded-bl-sm px-4 py-3 shadow-card">
                <div className="flex gap-1.5 items-center h-5">
                  <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar — fixed on mobile so it never gets covered or compressed,
             stays in normal flow on desktop */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-soil-deep md:static md:z-auto md:flex-shrink-0">

          {/* Image preview strip */}
          {attachedImage && (
            <div className="flex items-center gap-2 px-4 pt-3 max-w-3xl mx-auto">
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachedImage.preview}
                  alt="Attached photo"
                  className="h-14 w-auto rounded-xl border border-parchment/20 object-cover"
                />
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-bark text-parchment rounded-full
                             flex items-center justify-center text-[10px] hover:bg-harvest transition-colors"
                >
                  ×
                </button>
              </div>
              <span className="text-xs text-parchment/50 font-sans">Photo attached</span>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

          <div className="flex gap-2 items-end max-w-3xl mx-auto px-4 py-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={streaming}
              placeholder={isListening ? 'Listening…' : `Tell me about your ${cropName} today…`}
              className={`flex-1 bg-straw border rounded-xl px-4 py-3 text-sm font-sans text-soil
                         placeholder:text-bark/50 focus:outline-none focus:ring-2
                         resize-none disabled:opacity-50 transition-colors min-h-[48px] ${
                           isListening
                             ? 'border-harvest/60 focus:ring-harvest/30 focus:border-harvest'
                             : 'border-parchment/20 focus:ring-parchment/20 focus:border-parchment/40'
                         }`}
              style={{ maxHeight: '120px' }}
            />

            {/* Photo */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Attach a photo"
              className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-colors flex-shrink-0 disabled:opacity-40 ${
                attachedImage
                  ? 'bg-sage/40 border-sage/50 text-parchment'
                  : 'bg-parchment/15 border-parchment/25 text-parchment hover:bg-parchment/25'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>

            {/* Mic */}
            <button
              onClick={supportsVoice ? toggleListening : undefined}
              disabled={streaming || !supportsVoice}
              title={!supportsVoice ? 'Voice not supported in this browser' : isListening ? 'Stop recording' : 'Speak your message'}
              className={`relative flex items-center justify-center w-12 h-12 rounded-xl border transition-colors flex-shrink-0 disabled:opacity-40 ${
                isListening
                  ? 'bg-harvest/30 border-harvest/50 text-harvest'
                  : 'bg-parchment/15 border-parchment/25 text-parchment hover:bg-parchment/25'
              }`}
            >
              {isListening && <span className="absolute inset-0 rounded-xl border-2 border-harvest/50 animate-ping" />}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0014 0" strokeLinecap="round"/>
                <path d="M12 19v3M9 22h6" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Diary toggle */}
            {hasLogs && (
              <button
                onClick={() => setLogsOpen(o => !o)}
                title={logsOpen ? 'Close diary' : 'Open diary'}
                className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-colors flex-shrink-0 ${
                  logsOpen
                    ? 'bg-moss/40 border-moss/50 text-parchment'
                    : 'bg-parchment/15 border-parchment/25 text-parchment hover:bg-parchment/25'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}

            {/* Send */}
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !attachedImage) || streaming}
              className="btn-primary w-12 h-12 disabled:opacity-40 flex-shrink-0 p-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <p className="text-center text-[10px] text-parchment/25 font-sans pb-2">
            Enter to send · Shift+Enter for new line
          </p>

          {/* Soil illustration — mobile only, sits below the actions */}
          <svg
            className="md:hidden"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 800 140"
            preserveAspectRatio="none"
            width="100%"
            height="140"
            aria-hidden="true"
            style={{ display: 'block' }}
          >
            <path d="M0 62 Q80 50 160 60 Q240 70 320 55 Q400 42 480 56 Q560 68 640 54 Q720 44 800 58 L800 140 L0 140 Z" fill="#8B5E3C"/>
            <path d="M0 85 Q160 76 320 83 Q480 90 640 80 Q720 76 800 82 L800 140 L0 140 Z" fill="#6B3E22"/>
            <path d="M0 108 Q200 100 400 106 Q600 112 800 103 L800 140 L0 140 Z" fill="#4A2E14"/>
            <ellipse cx="120" cy="76" rx="9" ry="5.5" fill="#A57048" opacity="0.7"/>
            <ellipse cx="290" cy="88" rx="7" ry="4" fill="#8B5238" opacity="0.6"/>
            <ellipse cx="480" cy="70" rx="10" ry="5" fill="#A57048" opacity="0.65"/>
            <ellipse cx="650" cy="80" rx="6" ry="3.5" fill="#8B5238" opacity="0.55"/>
            <ellipse cx="380" cy="96" rx="8" ry="4.5" fill="#7A4228" opacity="0.5"/>
            <ellipse cx="730" cy="72" rx="5" ry="3" fill="#A57048" opacity="0.6"/>
            <path d="M175 62 L172 85 L162 108" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
            <path d="M172 85 L185 100" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>
            <path d="M400 55 L398 80 L388 105" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
            <path d="M398 80 L412 95" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>
            <path d="M628 56 L626 82 L614 106" stroke="#5C2E0A" strokeWidth="1.5" fill="none" opacity="0.55"/>
            <path d="M626 82 L638 96" stroke="#5C2E0A" strokeWidth="1" fill="none" opacity="0.45"/>
            <path d="M300 90 Q322 78 344 90 Q366 102 388 88" stroke="#C47840" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
            <circle cx="300" cy="90" r="5" fill="#C47840"/>
            <circle cx="300" cy="90" r="2" fill="#A05A28"/>
            <line x1="175" y1="62" x2="175" y2="18" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M175 32 Q158 22 153 29 Q158 38 175 36" fill="#4A6741"/>
            <path d="M175 46 Q192 36 197 43 Q192 52 175 50" fill="#5C7F52"/>
            <line x1="400" y1="55" x2="400" y2="6" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M400 20 Q382 10 377 18 Q382 27 400 25" fill="#4A6741"/>
            <path d="M400 34 Q418 24 423 32 Q418 41 400 39" fill="#5C7F52"/>
            <path d="M400 10 Q388 2 384 8 Q387 15 400 13" fill="#3A5233"/>
            <line x1="628" y1="56" x2="628" y2="14" stroke="#3A5233" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M628 27 Q611 18 606 25 Q611 34 628 31" fill="#4A6741"/>
            <path d="M628 42 Q645 33 650 40 Q645 49 628 46" fill="#5C7F52"/>
          </svg>
        </div>
      </div>

      {/* Drag divider — desktop only, when logs are open */}
      {logsOpen && hasLogs && (
        <div
          onMouseDown={handleDividerMouseDown}
          className="hidden lg:flex w-1.5 flex-shrink-0 bg-sage/20 hover:bg-sage/50 cursor-col-resize transition-colors"
        />
      )}

      {/* Session log sidebar — desktop only, collapsible */}
      {logsOpen && hasLogs && (
        <aside
          className="hidden lg:flex flex-col border-l border-sage/30 bg-parchment overflow-hidden flex-shrink-0"
          style={{ width: `${logsWidth}px` }}
        >
          <div className="px-4 py-3 border-b border-sage/20 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-base text-soil">Diary</h2>
              <p className="text-xs text-bark font-sans mt-0.5">Past sessions</p>
            </div>
            <button
              onClick={() => setLogsOpen(false)}
              className="text-bark/40 hover:text-soil transition-colors"
              title="Close diary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          {/* Search */}
          <div className="px-3 py-2 border-b border-sage/10">
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bark/40 pointer-events-none">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Search entries…"
                className="w-full bg-straw border border-sage/30 rounded-lg pl-7 pr-3 py-1.5 text-xs font-sans
                           text-soil placeholder:text-bark/40 focus:outline-none focus:ring-1 focus:ring-moss/30
                           focus:border-moss transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-sage/10">
            {(() => {
              const q = logSearch.toLowerCase().trim()
              const filtered = q
                ? sessionLogs.filter(log =>
                    log.observation?.toLowerCase().includes(q) ||
                    log.ai_advice?.toLowerCase().includes(q) ||
                    log.log_date.includes(q)
                  )
                : sessionLogs
              if (filtered.length === 0) return (
                <p className="px-4 py-6 text-xs text-bark/50 font-sans text-center">No entries match your search.</p>
              )
              return filtered.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs text-bark">{log.log_date}</span>
                    {log.sheet_posted
                      ? <span className="text-[10px] text-moss font-sans">✓ Saved to sheet</span>
                      : <RetryButton sessionLogId={log.id} />
                    }
                  </div>
                  {log.observation && (
                    <p className="text-xs text-soil font-sans line-clamp-2 leading-relaxed">{log.observation}</p>
                  )}
                  {log.ai_advice && (
                    <p className="text-xs text-moss font-sans mt-1 line-clamp-2 italic leading-relaxed">{log.ai_advice}</p>
                  )}
                </div>
              ))
            })()}
          </div>
        </aside>
      )}
    </div>
  )
}

function RetryButton({ sessionLogId }: { sessionLogId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')

  async function retry() {
    setStatus('loading')
    const res = await fetch('/api/session-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_log_id: sessionLogId }),
    })
    const data = await res.json()
    setStatus(data.ok ? 'ok' : 'fail')
  }

  if (status === 'ok') return <span className="text-[10px] text-moss font-sans">✓ Saved</span>
  if (status === 'fail') return <span className="text-[10px] text-harvest font-sans">Couldn&apos;t reach sheet</span>
  if (status === 'loading') return <span className="text-[10px] text-bark/50 font-sans">Retrying…</span>

  return (
    <button onClick={retry} className="text-[10px] text-harvest font-sans hover:underline">
      Retry →
    </button>
  )
}
