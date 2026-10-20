import Link from "next/link";
import ContinueCard from "./ContinueCard";
import JourneyIcon from "@/components/ui/JourneyIcon";
import WelcomeMotion from "./WelcomeMotion";

interface Props {
  greeting: string;
  nudgeText: string;
  nudgeHref: string;
  nudgeLabel: string;
  thisWeekCount: number | null;
  approvedNotPublished: number | null;
  totalPendingUnits: number | null;
}

export default function ClientHome(props: Props) {
  const { greeting, nudgeText, nudgeHref, nudgeLabel, thisWeekCount, approvedNotPublished, totalPendingUnits } = props;
  const actions = [
    { title: "Make something worth sharing.", label: "Quick Post", description: "Start with an idea. Shape it into a post in your voice, ready for your review.", href: "/generate/quick", action: "Create a post", number: "01", tone: "lilac", icon: "write" as const },
    { title: "Give your week a rhythm.", label: "Content Studio", description: "Bring your ideas together into a connected week of content.", href: "/generate", action: "Open the studio", number: "02", tone: "mint", icon: "plan" as const },
    { title: "The final word is yours.", label: "Content Review", description: totalPendingUnits !== null && totalPendingUnits > 0 ? `${totalPendingUnits} ${totalPendingUnits === 1 ? "item is" : "items are"} waiting for your review.` : "Read through your drafts, share feedback and approve when you are ready.", href: "/review", action: "Review content", number: "03", tone: "gold", icon: "review" as const },
  ];
  return (
    <div className="space-y-8 pb-8">
      <div className="workspace-welcome">
        <p className="workspace-eyebrow">Your daily overview</p>
        <h1 className="workspace-title">{greeting}</h1>
        <p className="workspace-description">A little focus. A clear next step. Content that sounds like you.</p>
        <WelcomeMotion />
      </div>
      <ContinueCard />
      <section className="workspace-panel workspace-nextstep flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6" aria-label="Your next step">
        <div><p className="workspace-eyebrow">Up next</p><p className="mt-1 text-base font-medium">{nudgeText}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href={nudgeHref} className="workspace-button">{nudgeLabel} <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Ways to work">
        {actions.map((item) => (
          <Link key={item.href} href={item.href} className={`workspace-panel workspace-card workspace-journey workspace-tone-${item.tone} group flex flex-col p-6 sm:p-7`}>
            <div className="mb-6 flex items-center justify-between"><span className="workspace-journey-icon"><JourneyIcon kind={item.icon} /></span><span aria-hidden="true" className="workspace-journey-number">{item.number}</span></div>
            <p className="workspace-eyebrow mb-2">{item.label}</p>
            <h2 className="max-w-[15ch] text-[28px] font-medium leading-8">{item.title}</h2>
            <p className="workspace-journey-description mt-4 flex-1 text-base leading-6">{item.description}</p>
            <span className="workspace-journey-footer mt-7">{item.action}<span aria-hidden="true" className="workspace-action-arrow">↗</span></span>
          </Link>
        ))}
      </section>
      <dl className="workspace-summary workspace-summary-accent workspace-panel">
        {[{ label: "Created this week", value: thisWeekCount }, { label: "Approved, not yet queued", value: approvedNotPublished }, { label: "Awaiting review", value: totalPendingUnits }].map(stat => <div key={stat.label}><dt className="text-xs text-gray-500 sm:text-sm">{stat.label}</dt><dd className={`mt-2 font-medium ${stat.value === null ? "text-sm" : "text-3xl tabular-nums"}`}>{stat.value ?? "Unavailable"}</dd></div>)}
      </dl>
    </div>
  );
}
