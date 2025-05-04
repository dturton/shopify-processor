import React from "react";
import { STORE_TIMEZONE } from "@/lib/dateUtils";

interface TimezoneDisplayProps {
  className?: string;
}

const TimezoneDisplay: React.FC<TimezoneDisplayProps> = ({
  className = "",
}) => {
  // Get the current timezone abbreviation (EST or EDT)
  const getTimezoneAbbr = (): string => {
    const date = new Date();
    const timezoneString = date.toLocaleString("en-US", {
      timeZone: STORE_TIMEZONE,
      timeZoneName: "short",
    });
    // Extract the timezone abbreviation (like EST or EDT)
    const tzAbbr = timezoneString.split(" ").pop();
    return tzAbbr || "";
  };

  return (
    <div className={`text-xs text-gray-500 ${className}`}>
      All times are shown in {getTimezoneAbbr()} ({STORE_TIMEZONE})
    </div>
  );
};

export default TimezoneDisplay;
