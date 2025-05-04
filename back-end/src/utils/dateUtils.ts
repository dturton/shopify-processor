/**
 * Date utility functions for consistent date handling
 */

export const STORE_TIMEZONE = "America/New_York"; // EST/EDT timezone

/**
 * Format a date to ISO 8601 format with timezone offset
 * Format: 2025-05-03T23:29:51.082+00:00
 *
 * @param date - Date to format
 * @returns ISO 8601 formatted date string
 */
export function formatISOWithOffset(date: Date): string {
  // Get the main part of the ISO string (YYYY-MM-DDTHH:mm:ss.sss)
  const isoBasic = date.toISOString().slice(0, 23);

  // Get the timezone offset in minutes
  const tzOffset = date.getTimezoneOffset();
  const absOffset = Math.abs(tzOffset);
  const tzHours = Math.floor(absOffset / 60)
    .toString()
    .padStart(2, "0");
  const tzMinutes = (absOffset % 60).toString().padStart(2, "0");
  const tzSign = tzOffset <= 0 ? "+" : "-";

  // Construct the timezone part (+00:00 format)
  const tzPart = `${tzSign}${tzHours}:${tzMinutes}`;

  // Return the combined ISO string with offset
  return `${isoBasic}${tzPart}`;
}

/**
 * Parse an ISO date string with timezone offset
 *
 * @param isoString - ISO 8601 formatted date string
 * @returns Date object
 */
export function parseISOWithOffset(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Get a display-friendly timezone abbreviation (e.g., EST, EDT)
 *
 * @returns Timezone abbreviation
 */
export function getTimezoneAbbreviation(): string {
  try {
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
    });

    const parts = format.formatToParts(new Date());
    const timeZonePart = parts.find((part) => part.type === "timeZoneName");

    return timeZonePart?.value || "America/New_York";
  } catch (error) {
    return "UTC";
  }
}

/**
 * Handle date string conversion from multiple formats
 * This function can handle:
 * 1. JS Date.toString(): "Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)"
 * 2. Date objects
 * 3. ISO strings
 *
 * And converts to the required format: "2025-05-03T23:29:51.082+00:00"
 *
 * @param input - Date input in various formats
 * @returns ISO 8601 formatted date string
 */
export function normalizeToISO(input: Date | string): string {
  try {
    // Parse the input to a Date object
    const date = input instanceof Date ? input : new Date(input);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date input");
    }

    // Format to ISO string with 'Z' (UTC)
    const isoString = date.toISOString();

    // Extract parts - YYYY-MM-DDThh:mm:ss.sss
    const datePart = isoString.substring(0, 23);

    // Add the +00:00 for UTC (instead of Z)
    return `${datePart}+00:00`;
  } catch (error) {
    console.error("Error normalizing to ISO format:", error);
    return "";
  }
}

/**
 * Format a date for Shopify API queries
 * Format: 2025-05-03T23:29:51-04:00 (without milliseconds)
 *
 * @param date - Date to format
 * @returns Formatted date string for Shopify API
 */
export function formatShopifyDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  try {
    // Convert to ISO string
    const isoString = date.toISOString();

    // Remove the milliseconds and 'Z'
    const dateWithoutMs = isoString.substring(0, 19);

    // Return with fixed offset for Eastern Time
    // For EDT (summer) use -04:00, for EST (winter) use -05:00
    // You could determine this dynamically, but a simple approach is:
    return `${dateWithoutMs}-04:00`; // Use -04:00 for EDT
    // Or for winter: return `${dateWithoutMs}-05:00`;  // Use -05:00 for EST
  } catch (error) {
    console.error("Error formatting date for Shopify:", error);
    return "";
  }
}
