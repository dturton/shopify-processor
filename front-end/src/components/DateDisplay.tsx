import React from "react";
import { formatStoreLocalDate } from "@/lib/dateUtils";

interface DateDisplayProps {
  date: Date | string;
  className?: string;
  showSeconds?: boolean;
  showTimezone?: boolean;
}

const DateDisplay: React.FC<DateDisplayProps> = ({
  date,
  className = "",
  showSeconds = true,
  showTimezone = true,
}) => {
  // Format the date with explicit parts
  const formatDate = (date: Date | string) => {
    return formatStoreLocalDate(date, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: showSeconds ? "2-digit" : undefined,
      timeZoneName: showTimezone ? "short" : undefined,
    });
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-lg font-medium">{formatDate(date)}</span>
    </div>
  );
};

export default DateDisplay;
