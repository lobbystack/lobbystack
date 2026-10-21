export default async function MarketingHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <main>
      <h1>LobbyStack</h1>
      <p data-locale={locale}>Marketing site placeholder.</p>
    </main>
  );
}
