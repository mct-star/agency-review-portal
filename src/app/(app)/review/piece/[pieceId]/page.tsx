import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ pieceId: string }>;
}

export default async function ReviewPiecePage({ params }: PageProps) {
  const { pieceId } = await params;
  redirect(`/content/${pieceId}`);
}
