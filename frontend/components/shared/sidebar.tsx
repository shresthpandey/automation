"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  MessageSquare, 
  Users, 
  BookOpen, 
  Settings, 
  LayoutDashboard, 
  LogOut 
} from "lucide-react";
import { cn } from "../../lib/utils";

const navigationItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Omni-Inbox", href: "/inbox", icon: MessageSquare },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden md:flex h-full w-16 lg:w-64 flex-col border-r border-border bg-card/60 backdrop-blur-md px-3 lg:px-4 py-6 text-card-foreground">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-1.5 lg:px-2 mb-8 overflow-hidden">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white font-bold text-lg shadow-md shadow-indigo-500/20 select-none">
          C
        </div>
        <div className="hidden lg:block whitespace-nowrap">
          <h1 className="font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground to-muted-foreground">ConverseOS</h1>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Omnichannel Workspace</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name} // Native tooltip when collapsed
              className={cn(
                "flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-primary" />
              )}
              <Icon className={cn(
                "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span className="hidden lg:block whitespace-nowrap">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile / Logout */}
      <div className="border-t border-border pt-4 mt-auto">
        <div className="flex items-center justify-center lg:justify-between gap-3 px-1 lg:px-2 py-1.5 overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-400 p-[1px]">
              <div className="h-full w-full rounded-full bg-card flex items-center justify-center text-xs font-semibold select-none">
                SP
              </div>
            </div>
            <div className="hidden lg:flex flex-col min-w-0">
              <span className="text-xs font-semibold leading-tight truncate">Shresth Pandey</span>
              <span className="text-[10px] text-muted-foreground">Owner</span>
            </div>
          </div>
          <Link href="/login" title="Logout" className="hidden lg:block text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
