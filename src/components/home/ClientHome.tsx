import Link from "next/link";
import ContinueCard from "./ContinueCard";

interface Props {
  greeting: string;
  strategyCompleted: boolean;
  nudgeText: string;
  nudgeHref: string;
  nudgeLabel: string;
  thisWeekCount: number;
  approvedNotPublished: number;
  totalPendingUnits: number;
}

export default function ClientHome(props: Props) {
  const { greeting, strategyCompleted, nudgeText, nudgeHref, nudgeLabel, thisWeekCount, approvedNotPublished, totalPendingUnits } = props;
  const actions = [
    { title: "Make something worth sharing.", label: "Quick Post", description: "Start with an idea. Shape it into a post in your voice, ready for your review.", href: "/generate/quick", action: "Create a post", number: "01" },
    { title: "Give your week a rhythm.", label: "Content Studio", description: "Bring your ideas together into a connected week of content.", href: "/generate", action: "Open the studio", number: "02" },
    { title: "The final word is yours.", label: "Content Review", description: totalPendingUnits > 0 ? `${totalPendingUnits} ${totalPendingUnits === 1 ? "item is" : "items are"} waiting for your review.` : "Read through your drafts, share feedback and approve when you are ready.", href: "/review", action: "Review content", number: "03" },
  ];
  return (
    <div className="space-y-8 pb-8">
      <div>
        <p className="workspace-eyebrow">Your daily overview</p>
        <h1 className="workspace-title">{greeting}</h1>
        <p className="workspace-description">A little focus. A clear next step. Content that sounds like you.</p>
      </div>
      <ContinueCard />
      <section className="workspace-panel flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6" aria-label="Your next step">
        <div><p className="workspace-eyebrow">Up next</p><p className="mt-1 text-base font-medium">{nudgeText}</p></div>
        <div className="flex flex-wrap gap-2">
          {!strategyCompleted ? <><Link href="/strategy" className="workspace-button workspace-button-secondary">Build your strategy</Link><Link href="/generate/quick" className="workspace-button">Create a post <span aria-hidden="true">↗</span></Link></> : <Link href={nudgeHref} className="workspace-button">{nudgeLabel} <span aria-hidden="true">↗</span></Link>}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Ways to work">
        {actions.map((item) => (
          <Link key={item.href} href={item.href} className="workspace-panel workspace-card group flex flex-col p-6 sm:p-7">
            <div className="mb-8 flex items-center justify-between"><span className="workspace-eyebrow">{item.label}</span><span aria-hidden="true" className="text-sm text-gray-400">{item.number}</span></div>
            <h2 className="max-w-[15ch] text-[28px] font-medium leading-8">{item.title}</h2>
            <p className="mt-4 flex-1 text-base leading-6 text-gray-500">{item.description}</p>
            <span className="mt-7 flex min-h-11 items-center justify-between border-t border-gray-200 pt-4 text-sm font-medium">{item.action}<span aria-hidden="true" className="text-xl text-violet-700">↗</span></span>
          </Link>
        ))}
      </section>
      <dl className="workspace-summary workspace-panel">
        {[{ label: "Created this week", value: thisWeekCount }, { label: "Approved posts", value: approvedNotPublished }, { label: "Awaiting review", value: totalPendingUnits }].map(stat => <div key={stat.label}><dt className="text-xs text-gray-500 sm:text-sm">{stat.label}</dt><dd className="mt-2 text-3xl font-medium tabular-nums">{stat.value}</dd></div>)}
      </dl>
    </div>
  );
}
