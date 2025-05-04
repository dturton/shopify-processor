# Date Format Handling

## Date Format Types

This application manages several date format types:

1. **JavaScript Date objects**: Used internally in the application
2. **JavaScript Date.toString()**: `"Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)"`
3. **ISO 8601 with UTC (Z)**: `"2025-05-03T23:29:51.082Z"` (from `Date.toISOString()`)
4. **ISO 8601 with timezone offset**: `"2025-05-03T23:29:51.082+00:00"` (our internal API format)
5. **Shopify API format**: `"2025-05-03T23:29:51-04:00"` (used only for Shopify queries)

## Utility Functions

The `dateUtils.ts` file contains several functions to handle conversions between these formats:

- `normalizeToISO(input: Date | string)`: Converts any date input to format #4
- `formatISOWithOffset(date: Date)`: Similar to normalizeToISO but with more control
- `formatShopifyDate(date: Date)`: Converts to format #5 for Shopify API queries
- `formatStoreLocalDate(date: Date, options)`: Formats a date for display in the store's timezone
- `getTimezoneAbbreviation()`: Gets the current timezone abbreviation (e.g., EST, EDT)

## Date Handling Rules

1. **Storage**: Always store dates in MongoDB in UTC format.
2. **API Responses**: Include both raw dates and formatted ISO strings with timezone offsets.
3. **Shopify API**: Use `formatShopifyDate()` for all date filters in Shopify API queries.
4. **UI Display**: Use `formatStoreLocalDate()` to display dates in the store's timezone.

## Debugging Date Issues

If you encounter date-related issues:

1. Use the `dateConverter.ts` CLI tool to check date formats:
   ```
   npx ts-node src/utils/dateConverter.ts "Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)"
   ```

2. Check logs for date format information:
   ```
   Performing incremental sync with lastSyncTime: 2025-05-03T23:29:51.082+00:00 (Shopify format: 2025-05-03T19:29:51-04:00)
   ```

3. Verify that Shopify API queries use the correct format:
   ```
   updated_at:>=2025-05-03T19:29:51-04:00
   ```

## Common Errors

1. **"Invalid search field for this query"**: Indicates that the date format sent to Shopify API is incorrect.
   - Solution: Make sure to use `formatShopifyDate()` for all date filters.

2. **Date timezone inconsistencies**: Dates appear in the wrong timezone.
   - Solution: Use `formatStoreLocalDate()` for displaying dates.

3. **Date parsing failures**: Occurs when the date input format is unexpected.
   - Solution: Use `normalizeToISO()` to handle various date input formats.

## Timezone Configuration

The application is configured to use Eastern Time (America/New_York) by default. This can be changed in `config.ts`:

```typescript
shopify: {
  // ...
  timezone: process.env.SHOPIFY_TIMEZONE || "America/New_York",
}
```

## Testing Date Formatting

Use the following approach to test date formatting:

```typescript
// Input date (could be in various formats)
const inputDate = "Sat May 03 2025 20:24:31 GMT-0400 (Eastern Daylight Time)";

// For storing in the database (UTC)
const databaseDate = new Date(inputDate);

// For API responses (ISO 8601 with timezone offset)
const apiResponseDate = normalizeToISO(inputDate);

// For Shopify API queries
const shopifyQueryDate = formatShopifyDate(new Date(inputDate));

// For displaying to users
const displayDate = formatStoreLocalDate(new Date(inputDate));
```