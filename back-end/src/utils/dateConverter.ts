#!/usr/bin/env node
/**
 * Date Format Converter CLI Tool
 *
 * This utility helps convert between different date formats, particularly for
 * Shopify integration debugging.
 *
 * Usage:
 *   npx ts-node src/utils/dateConverter.ts "Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)"
 */

import {
  formatISOWithOffset,
  formatShopifyDate,
  normalizeToISO,
} from "./dateUtils";

// Get input from command line
const dateInput = process.argv[2];

if (!dateInput) {
  console.error("Please provide a date string as an argument");
  console.log(
    'Example: npx ts-node src/utils/dateConverter.ts "Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)"'
  );
  process.exit(1);
}

try {
  // Parse the input date
  const date = new Date(dateInput);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date format");
  }

  // Convert to different formats
  const isoFormat = normalizeToISO(date);
  const shopifyFormat = formatShopifyDate(date);
  const isoWithOffset = formatISOWithOffset(date);

  // Output results
  console.log("\nDate Format Conversion Results:");
  console.log("===============================");
  console.log("Input:                   ", dateInput);
  console.log("Date object toString():  ", date.toString());
  console.log("Date object toISOString():", date.toISOString());
  console.log("\nConverted Formats:");
  console.log("------------------");
  console.log("ISO 8601 with offset:    ", isoFormat);
  console.log("Shopify API format:      ", shopifyFormat);
  console.log("ISO with calculated TZ:  ", isoWithOffset);
  console.log("\nFor Shopify Query:");
  console.log("----------------");
  console.log(`updated_at:>=${shopifyFormat}`);

  // Debug timezone info
  console.log("\nTimezone Information:");
  console.log("--------------------");
  console.log("Timezone offset:         ", date.getTimezoneOffset(), "minutes");
  console.log(
    "UTC time:                ",
    new Date(date.toUTCString()).toISOString()
  );
} catch (error) {
  console.error(
    "Error processing date:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
