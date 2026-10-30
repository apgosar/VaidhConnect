export default function SiteFooter() {
  return (
    <footer className="px-4 py-6 text-center">
      <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
        <a
          href="https://siddhtech.ai/swasthyaconnect"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
          style={{ color: 'var(--color-sage)' }}
        >
          SwasthyaConnect
        </a>
        {' '}© {new Date().getFullYear()} · Powered by{' '}
        <a
          href="https://siddhtech.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
          style={{ color: 'var(--color-sage)' }}
        >
          Siddh Tech Solutions
        </a>
      </p>
    </footer>
  )
}
