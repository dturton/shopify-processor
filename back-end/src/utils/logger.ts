// src/utils/logger.ts
import { createLogger, format, transports, Logger } from "winston";
import config from "../config";

// Create and configure the logger
const logger: Logger = createLogger({
  level: config.logging.level || "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "shopify-processor" },
  transports: [
    // Console transport for development
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...metadata }) => {
          let metaStr = "";
          if (Object.keys(metadata).length > 0 && !metadata.service) {
            metaStr = JSON.stringify(metadata);
          }
          return `${timestamp} ${level}: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === "production") {
  logger.add(
    new transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new transports.File({
      filename: "logs/combined.log",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );
}

export default logger;
