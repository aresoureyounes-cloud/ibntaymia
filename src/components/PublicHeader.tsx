import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BrandWordmark } from "./BrandWordmark";

export function PublicHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-3 sm:h-18 sm:px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <BrandWordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" asChild className="rounded-full px-4">
            <Link to="/">{t("nav.home")}</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="rounded-full px-4">
            <Link to="/about">{t("nav.about")}</Link>
          </Button>
          <LanguageSwitcher />
          <ThemeToggle />
          {user ? (
            <Button size="sm" asChild className="rounded-full px-5">
              <Link to="/dashboard">{t("nav.dashboard")}</Link>
            </Button>
          ) : (
            <Button size="sm" asChild className="rounded-full px-5">
              <Link to="/login">{t("nav.login")}</Link>
            </Button>
          )}
        </nav>

        {/* Mobile nav */}
        <div className="flex items-center gap-1 md:hidden">
          {user ? (
            <Button size="sm" asChild className="h-8 rounded-full px-3 text-xs">
              <Link to="/dashboard">{t("nav.dashboard")}</Link>
            </Button>
          ) : (
            <Button size="sm" asChild className="h-8 rounded-full px-3 text-xs">
              <Link to="/login">{t("nav.login")}</Link>
            </Button>
          )}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label={t("nav.open_menu") ?? "Open menu"}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-2">
                <Button variant="ghost" asChild onClick={() => setOpen(false)} className="justify-start rounded-full">
                  <Link to="/">{t("nav.home")}</Link>
                </Button>
                <Button variant="ghost" asChild onClick={() => setOpen(false)} className="justify-start rounded-full">
                  <Link to="/about">{t("nav.about")}</Link>
                </Button>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-border p-3">
                  <span className="text-sm text-muted-foreground">
                    {t("nav.language") ?? "Language"}
                  </span>
                  <LanguageSwitcher />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border p-3">
                  <span className="text-sm text-muted-foreground">{t("nav.theme") ?? "Theme"}</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
