"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpLeft,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

type DashboardRole =
  | "super_admin"
  | "admin"
  | "restaurant"
  | "supermarket"
  | "produce_vendor"
  | "meat_seafood_vendor"
  | "captain"
  | "customer"
  | null;

type DashboardFrameProps = {
  identity: { name: string; email: string | null; role: DashboardRole };
  title: string;
  subtitle?: string;
  activePath: string;
  children: ReactNode;
};

const roleLabels: Record<Exclude<DashboardRole, null>, string> = {
  super_admin: "سوپەر ئەدمین",
  admin: "بەڕێوەبەر",
  restaurant: "دوکانداری چێشتخانە",
  supermarket: "دوکانداری سوپەرمارکێت",
  produce_vendor: "فرۆشیاری سەوزە و میوە",
  meat_seafood_vendor: "فرۆشیاری گۆشت و سپیاتی",
  captain: "کاپتنی گەیاندن",
  customer: "کڕیار",
};

const merchantRoles: DashboardRole[] = [
  "restaurant",
  "supermarket",
  "produce_vendor",
  "meat_seafood_vendor",
];

export function DashboardFrame({
  identity,
  title,
  subtitle,
  activePath,
  children,
}: DashboardFrameProps) {
  const role = identity.role;
  const navigation = [
    { href: "/dashboard", label: "پوختە", icon: LayoutDashboard, visible: true },
    { href: "/dashboard/orders", label: "داواکاریەکان", icon: ClipboardList, visible: role !== null },
    { href: "/dashboard/products", label: "بەرهەمەکان", icon: Boxes, visible: merchantRoles.includes(role) },
    { href: "/dashboard/addresses", label: "ناونیشانەکان", icon: MapPinned, visible: role === "customer" },
    { href: "/merchant/apply", label: "داواکاری دوکانداری", icon: Store, visible: role === "customer" },
    { href: "/dashboard/delivery-zones", label: "ناوچەی گەیاندن", icon: MapPinned, visible: role === "admin" || role === "super_admin" },
    { href: "/dashboard/merchant-applications", label: "داواکاری فرۆشگا", icon: ShieldCheck, visible: role === "admin" || role === "super_admin" },
  ].filter((item) => item.visible);

  const roleLabel = role ? roleLabels[role] : "ڕۆڵ دیاری نەکراوە";

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link href="/" className="brand dashboard-brand" aria-label="شاخ ستور">
          <span className="brand-mark"><Store size={23} /></span>
          <span className="brand-name">Shakh <b>Store</b></span>
        </Link>

        <div className="dashboard-identity">
          <span className="dashboard-avatar"><UserRound size={20} /></span>
          <span>
            <strong>{identity.name}</strong>
            <small>{roleLabel}</small>
          </span>
        </div>

        <nav className="dashboard-nav" aria-label="بەشەکانی داشبۆرد">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = activePath === href;
            return (
              <Link
                href={href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                key={href}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-sidebar-footer">
          <Link className="dashboard-nav-link" href="/">
            <ArrowUpLeft size={17} /> گەڕانەوە بۆ بازاڕ
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-main-inner">
          <header className="dashboard-main-header">
            <div>
              <p className="dashboard-kicker">شاخ ستور / داشبۆرد</p>
              <h1>{title}</h1>
              {subtitle && <p className="dashboard-subtitle">{subtitle}</p>}
            </div>
            <div className="dashboard-header-account">
              <span className="dashboard-header-email" dir="ltr">{identity.email ?? ""}</span>
            </div>
          </header>
          <div className="dashboard-content">{children}</div>
        </div>
      </main>
    </div>
  );
}
