import type { Comment, User } from "@/types/database";

interface CommentThreadProps {
  comments: (Comment & { user: User })[];
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function CommentThread({ comments }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <p className="mb-4 text-sm text-gray-400">No comments yet.</p>
    );
  }

  return (
    <div className="mb-4 space-y-4">
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700">
            {(comment.user?.full_name || comment.user?.email || "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {comment.user?.full_name || comment.user?.email}
              </span>
              <span className="text-xs text-gray-400">
                {timeAgo(comment.created_at)}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
