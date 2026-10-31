import { notFound } from 'next/navigation';
import AdminConsole, { type Section } from '../AdminConsole';

const sections = new Set<Section>([
  'tenants',
  'providers',
  'routing',
  'skills',
  'knowledge',
  'mcp',
  'learning',
  'audit',
  'settings',
]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section as Section)) notFound();
  return <AdminConsole section={section as Section} />;
}
