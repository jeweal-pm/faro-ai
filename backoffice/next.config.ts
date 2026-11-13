import type { NextConfig } from 'next';

const gateway = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
// Give every build a unique deployment ID so open tabs can detect stale Next.js assets/actions.
const deploymentId = process.env.NEXT_DEPLOYMENT_ID || Date.now().toString(36);

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId,
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  allowedDevOrigins: ['127.0.0.1'],
  async rewrites() {
    return [
      { source: '/api/admin/:path*', destination: `${gateway}/admin/v1/:path*` },
      { source: '/api/tenant/:path*', destination: `${gateway}/tenant/v1/:path*` },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

export default nextConfig;
