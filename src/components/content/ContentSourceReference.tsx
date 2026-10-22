interface Props {
  reference: string | null;
  isAdmin: boolean;
}

const badgeClass = "rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium";

export default function ContentSourceReference({ reference, isAdmin }: Props) {
  if (!reference) return null;

  const isImportPath = /^(?:[\\/]|[a-z]:[\\/]|file:|~[\\/]|\.{1,2}[\\/])/i.test(reference.trim());
  if (!isImportPath) return <span className={badgeClass}>{reference}</span>;

  return (
    <>
      <span className={badgeClass}>Imported content</span>
      {isAdmin && (
        <details className="order-last basis-full min-w-0 text-xs text-gray-500">
          <summary className="min-h-11 cursor-pointer py-3">Import source</summary>
          <p className="whitespace-pre-wrap break-all font-mono">{reference}</p>
        </details>
      )}
    </>
  );
}
