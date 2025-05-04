// src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import apiRoutes from "./routes/api";
import config from "./config";
import logger from "./utils/logger";
import { integrationQueue } from "./queues/IntegrationJobProcessor";
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(integrationQueue)],
  serverAdapter: serverAdapter,
});

// Initialize Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/admin/queues", serverAdapter.getRouter());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

// Apply API routes
app.use("/api", apiRoutes);
app.use("/", apiRoutes);
// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    version: process.env.npm_package_version || "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", {
      error: err.message,
      stack: err.stack,
      path: req.path,
    });

    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
);

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.db.uri);
    logger.info("Connected to MongoDB");

    // Start server
    const PORT = config.server.port;
    app.listen(PORT, () => {
      logger.info(
        `Server running on port ${PORT} in ${config.server.nodeEnv} mode`
      );
    });
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await mongoose.connection.close();
  logger.info("Server shutdown complete");
  logger.info("Sync workers shutdown complete");

  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await mongoose.connection.close();
  logger.info("Server shutdown complete");
  process.exit(0);
});

// Handle uncaught exceptions and rejections
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection:", {
    reason,
    promise,
  });
  process.exit(1);
});

export default app;
