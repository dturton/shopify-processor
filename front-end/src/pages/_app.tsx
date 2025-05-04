import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SWRConfig } from "swr";

const fetcher = async (url: string) => {
  const response = await fetch(url);

  // If response is not OK, throw an error with status
  if (!response.ok) {
    const error: any = new Error("An error occurred while fetching the data.");
    // Attach the status code to the error
    error.status = response.status;
    // Attach the response data if any
    try {
      error.info = await response.json();
    } catch {
      error.info = { message: "Failed to parse error response" };
    }
    throw error;
  }

  return response.json();
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SWRConfig value={{ fetcher }}>
      <Component {...pageProps} />
    </SWRConfig>
  );
}
