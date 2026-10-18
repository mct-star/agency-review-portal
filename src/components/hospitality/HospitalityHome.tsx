import Link from "next/link";
import { postsWaitingLine } from "@/lib/hospitality/home";

export interface HospitalityHomeProps {
  greeting: string;
  /** Posts drafted for the venue that are waiting to be approved. */
  pendingPosts: number;
  /** Photos from the team waiting to be looked at. */
  photosWaiting: number;
  /** Approved photos and clips in the library. */
  libraryCount: number;
  /** One line about the next weather post, or null when it is switched off. */
  weatherLine: string | null;
  /** Set when the most recent weather post did not draft. */
  weatherFailedLine?: string | null;
}

/**
 * The home page for a hospitality venue: what is waiting, and three plain
 * ways to start. No strategy, no studio, no dashboard: those are for the
 * business-to-business pack.
 */
export default function HospitalityHome({ greeting, pendingPosts, photosWaiting, libraryCount, weatherLine, weatherFailedLine }: HospitalityHomeProps) {
  const somethingWaiting = pendingPosts > 0 || photosWaiting > 0;
  const waitingTotal = pendingPosts + photosWaiting;
  const libraryLine =
    libraryCount === 0
      ? "Nothing in your library yet. Add photos from your phone and we will use them on your posts."
      : `${libraryCount} ${libraryCount === 1 ? "photo or video is" : "photos and videos are"} in your library. Add more any time, straight from your phone.`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12 pt-2 md:pt-6">
      <div><p className="workspace-eyebrow">Your week, made easier</p><h1 className="workspace-title">{greeting}</h1></div>

      {/* Waiting for you */}
      <section
        aria-labelledby="waiting-heading"
        className={`rounded-xl border p-5 sm:p-6 ${somethingWaiting ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-bold ${
                somethingWaiting ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-500"
              }`}
              aria-hidden="true"
            >
              {waitingTotal > 99 ? "99+" : waitingTotal}
            </div>
            <div>
              <h2 id="waiting-heading" className="workspace-section-title">
                Waiting for you
              </h2>
              <p className="text-sm text-gray-700">{postsWaitingLine(pendingPosts, photosWaiting)}</p>
            </div>
          </div>
          <Link
            href="/approvals"
            className={`workspace-button ${somethingWaiting ? "" : "workspace-button-secondary"}`}
          >
            {somethingWaiting ? "See what is waiting" : "Open Waiting for you"}
          </Link>
        </div>
      </section>

      {/* Three ways to start */}
      <section className="grid gap-4 md:grid-cols-3" aria-label="Start here">
        <ActionCard
          href="/generate/quick"
          title="Write a post"
          body="One dish, a busy night, an event. Tell us what you want to say, we write it and you approve it."
          action="Write a post"
        />
        <ActionCard
          href="/create/week-interview"
          title="Talk through the week"
          body="Say what is on this week and we plan the week for you. You approve every post."
          action="Talk it through"
        />
        <ActionCard href="/library" title="Add photos" body={libraryLine} action="Open the library" />
      </section>

      {weatherFailedLine && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {weatherFailedLine}{" "}
          <Link href="/generate/quick" className="font-semibold underline">Write a post</Link>
        </p>
      )}
      {weatherLine && <p className="text-sm text-gray-600">{weatherLine}</p>}
    </div>
  );
}

function ActionCard({ href, title, body, action }: { href: string; title: string; body: string; action: string }) {
  return (
    <div className="workspace-panel flex flex-col p-5">
      <h2 className="workspace-section-title">{title}</h2>
      <p className="mt-2 flex-1 text-sm text-gray-600">{body}</p>
      <Link
        href={href}
        className="workspace-button workspace-button-secondary mt-5"
      >
        {action}
      </Link>
    </div>
  );
}
