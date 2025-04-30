import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configuration object
const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },
  db: {
    uri:
      process.env.MONGODB_URI || "mongodb://localhost:27017/shopify-processor",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecret: process.env.SHOPIFY_API_SECRET || "",
    scopes: (process.env.SHOPIFY_SCOPES || "").split(","),
    hostName: process.env.SHOPIFY_HOST || "",
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
};

export default config;
