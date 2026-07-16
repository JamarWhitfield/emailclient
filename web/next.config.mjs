

const nextConfig = {
  // Allow larger file uploads (up to 10 MB) for CSV/Excel recipient files.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
