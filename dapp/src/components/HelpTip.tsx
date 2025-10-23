import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function HelpTip({ title = 'Quick help', children }: { title?: string; children: any }) {
  return (
    <div className="glass rounded-md p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-zinc-300"><Info size={18} /></div>
        <div className="space-y-1 text-zinc-300">
          <div className="font-medium text-white/90">{title}</div>
          <div className="leading-relaxed">{children}</div>
          <div className="text-xs text-zinc-400">Need more detail? See the <Link to="/help" className="underline hover:text-white">Help</Link> page.</div>
        </div>
      </div>
    </div>
  )
}
