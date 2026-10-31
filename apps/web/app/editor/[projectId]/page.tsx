import { IdeClient } from "../../../components/IdeClient";

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { projectId } = await params;
  const { lang } = await searchParams;
  return (
    <div style={{ height: "100dvh" }}>
      <IdeClient projectId={decodeURIComponent(projectId)} language={lang} />
    </div>
  );
}
