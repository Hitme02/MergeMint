import { motion } from 'framer-motion'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10">
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.8 }}
        className="max-w-6xl mx-auto px-4 py-10 text-center text-sm text-zinc-400">
        Built with ❤️ for open-source contributors.
      </motion.div>
    </footer>
  )
}
