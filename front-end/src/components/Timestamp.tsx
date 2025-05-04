import React from "react";
import { formatStoreLocalDate, getRelativeTimeString } from "@/lib/dateUtils";

interface TimestampProps {
  date: Date | string;
  showRelative?: boolean;
  className?: string;
  includeTime?: boolean;
}

const Timestamp: React.FC<TimestampProps> = ({
  date,
  showRelative = true,
  className = "",
  includeTime = true,
}) => {
  // Format options
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };

  // Format the date in the store's timezone
  const formattedDate = formatStoreLocalDate(date, options);

  // Get relative time string if requested
  const relativeTime = showRelative ? getRelativeTimeString(date) : null;

  return (
    <span className={className} title={formattedDate}>
      {relativeTime ? (
        <>
          <span className="font-medium">{relativeTime}</span>
          <span className="text-gray-400 text-sm ml-1">({formattedDate})</span>
        </>
      ) : (
        formattedDate
      )}
    </span>
  );
};

export default Timestamp;
