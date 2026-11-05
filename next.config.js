/** @type {import('next').NextConfig} */
const nextConfig = {
  // the app has no next/image pictures, so the image optimizer endpoint is turned off
  images: { unoptimized: true },
  experimental: {
    // transformers.js uses native onnxruntime binaries, so it must not be bundled by webpack
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
};

module.exports = nextConfig;
