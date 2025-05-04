import React, { ReactNode } from "react";
import Head from "next/head";
import Navbar from "./Navbar";
import TimezoneDisplay from "./TimezoneDisplay";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  title = "Shopify Product Processor",
}) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content="Shopify Product Processor Dashboard"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Navbar />

      <main className="flex-grow container mx-auto py-6 px-4">{children}</main>

      <footer className="py-6 bg-gray-100">
        <div className="container mx-auto text-center text-gray-600">
          <p>© {new Date().getFullYear()} Shopify Product Processor</p>
          <TimezoneDisplay className="mt-2" />
        </div>
      </footer>
    </div>
  );
};

export default Layout;
