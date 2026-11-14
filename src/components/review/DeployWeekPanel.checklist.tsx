export interface DeployBlogResult {
  id: string;
  title: string;
  status: "pull_request_opened" | "already_sent" | "manual";
  url?: string | null;
  reason?: string;
}

export interface DeployChecklistProps {
  blogs: DeployBlogResult[];
  newsletters: Array<{ id: string; title: string; copyHref: string }>;
  schedulerExportHref: string;
  /** Posts Deploy week listed as in the scheduler export. */
  exportCount: number;
}

/** The steps Deploy week leaves to a person, each with the link that does it. */
export function DeployChecklist({ blogs, newsletters, schedulerExportHref, exportCount }: DeployChecklistProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">Still to do by hand</h3>
      <ul className="mt-2 space-y-2 text-sm text-amber-900">
        {blogs.map((b) => (
          <li key={b.id} className="flex gap-2">
            <input type="checkbox" aria-label={`Done: ${b.title}`} className="mt-1" />
            <span>
              {b.url
                ? <>Merge the blog pull request for &quot;{b.title}&quot;: <a className="underline" href={b.url} target="_blank" rel="noopener noreferrer">open the pull request</a>. It goes live when merged.</>
                : <>Publish the blog &quot;{b.title}&quot;. {b.reason || ""} <a className="underline" href={`/content/${b.id}`}>Open the blog</a>.</>}
            </span>
          </li>
        ))}
        <li className="flex gap-2">
          <input type="checkbox" aria-label="Done: scheduler export" className="mt-1" />
          <span>
            {exportCount > 0
              ? <>Upload the scheduler export for the {exportCount === 1 ? "post" : `${exportCount} posts`} listed as in the scheduler export, and for any channel without direct publishing. </>
              : <>Upload the scheduler export only if the company posts to channels without direct publishing. </>}
            It leaves out of LinkedIn every post already in the LinkedIn queue: <a className="underline" href={schedulerExportHref}>download the scheduler export</a>.
          </span>
        </li>
        {newsletters.map((n) => (
          <li key={n.id} className="flex gap-2">
            <input type="checkbox" aria-label={`Done: ${n.title}`} className="mt-1" />
            <span>
              Publish the newsletter &quot;{n.title}&quot; on LinkedIn, then mark it as published: <a className="underline" href={n.copyHref}>open its copy page</a>.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
