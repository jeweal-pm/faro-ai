import DiscoveryPage from './discovery-page';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <DiscoveryPage trainingOptions={{
    local: process.env.FAROAI_LOCAL_LLM_ENABLED === 'true',
    shared: process.env.FAROAI_DEPLOYMENT_MODE !== 'self_hosted'
      && process.env.FAROAI_SHARED_TRAINING_ENABLED === 'true',
  }} />;
}
