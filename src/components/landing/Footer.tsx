export function Footer() {
  return (
    <footer className="bg-[#111114] border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <p className="text-sm text-zinc-400">
            Built by{" "}
            <a
              href="https://secretsaunacompany.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 hover:text-white transition-colors"
            >
              Secret Sauna Company
            </a>
            , Squamish, BC
          </p>
          <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-500">
            <a
              href="https://github.com/ToastedandTripping/opencanopy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/ToastedandTripping/opencanopy/blob/main/METHODOLOGY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              Methodology
            </a>
            <a
              href="https://github.com/ToastedandTripping/opencanopy/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              Contributing
            </a>
            <a
              href="mailto:opencanopymap@gmail.com"
              className="hover:text-zinc-300 transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/5">
          <p className="text-xs text-zinc-600">
            Data from BC Government. Not affiliated with or endorsed by the
            Province of British Columbia.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            <a
              href="https://github.com/ToastedandTripping/opencanopy/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-400 transition-colors"
            >
              AGPLv3 License
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
