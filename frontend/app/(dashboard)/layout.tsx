import { Sidebar } from "../../components/shared/sidebar";
import { Navbar } from "../../components/shared/navbar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Permanent Sidebar (Left) */}
      <Sidebar />

      {/* Workspace Area (Right) */}
      <div className="pl-64 flex flex-col min-h-screen">
        {/* Workspace Sticky Header */}
        <Navbar />

        {/* Dynamic Workspace Content */}
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
