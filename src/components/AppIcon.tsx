// The app's brand mark: an indigo calendar whose rows are the three shift
// colours (Mid teal / EU purple / USA pink). Matches the Slack app icon.
export function AppIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg overflow-hidden shrink-0`}>
      <svg viewBox="0 0 512 512" className="w-full h-full block" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="appicon-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill="url(#appicon-bg)" />
        <rect x="156" y="96" width="30" height="58" rx="15" fill="#e0e7ff" />
        <rect x="326" y="96" width="30" height="58" rx="15" fill="#e0e7ff" />
        <rect x="84" y="128" width="344" height="300" rx="34" fill="#ffffff" />
        <path d="M84 162a34 34 0 0 1 34-34h276a34 34 0 0 1 34 34v28H84z" fill="#4338ca" />
        <rect x="118" y="231" width="276" height="40" rx="13" fill="#06b6d4" />
        <rect x="118" y="289" width="276" height="40" rx="13" fill="#8b5cf6" />
        <rect x="118" y="347" width="196" height="40" rx="13" fill="#ec4899" />
      </svg>
    </div>
  );
}
