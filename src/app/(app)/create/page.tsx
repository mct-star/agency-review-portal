import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create | AGENCY",
  description: "Choose how you want to create content",
};

const modes = [
  {
    title: "Quick Post",
    description: "One post in 30 seconds",
    href: "/generate/quick",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: "Week Batch",
    description: "Generate a full week of ecosystem-linked posts",
    href: "/generate",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
      </svg>
    ),
  },
  {
    title: "Blog / Article",
    description: "Long-form thought leadership",
    href: "/create/article",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 17h3l2-4V7H5v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z" />
      </svg>
    ),
  },
  {
    title: "Month Batch",
    description: "Plan and generate an entire month",
    href: "/create/month",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 5a2 2 0 0 1 2-2h2V2a1 1 0 1 1 2 0v1h6V2a1 1 0 1 1 2 0v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm16 4H5v10h14V9ZM7 11h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2ZM7 15h2v2H7v-2Zm4 0h2v2h-2v-2Z" />
      </svg>
    ),
  },
];

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Content</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose how you want to create content today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modes.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-amber-300 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100">
              {mode.icon}
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{mode.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{mode.description}</p>
            <span className="mt-4 text-sm font-medium text-amber-600 group-hover:text-amber-700">
              Get started &rarr;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
