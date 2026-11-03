/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // transformers.js uses native onnxruntime binaries, so it must not be bundled by webpack
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
};

module.exports = nextConfig;
