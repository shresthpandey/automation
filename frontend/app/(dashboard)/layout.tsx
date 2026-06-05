"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, BookOpen, Settings } from "lucide-react";
import { Sidebar } from "../../components/shared/sidebar";
import { Navbar } from "../../components/shared/navbar";
import { cn } from "../../lib/utils";

const mobileNavItems = [
  { name: "Omni-Inbox", href: "/inbox", icon: MessageSquare },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen bg-background">
      {/* Permanent Sidebar (Left) - Hidden on mobile, collapsed on tablet, wide on desktop */}
      <Sidebar />

      {/* Workspace Area (Right) - pl-0 on mobile, pl-16 on tablet, pl-64 on desktop */}
      <div className="pl-0 md:pl-16 lg:pl-64 flex flex-col min-h-screen">
        {/* Workspace Sticky Header - Hidden on mobile */}
        <div className="hidden md:block">
          <Navbar />
        </div>

        {/* Dynamic Workspace Content - Padding resets for full-bleed mobile views */}
        <main className="flex-1 p-0 md:p-6 lg:p-8 pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-card/85 backdrop-blur-lg flex items-center justify-around md:hidden px-4 select-none">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl transition-all duration-200 relative w-12 h-12", // 48x48px touch target
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
