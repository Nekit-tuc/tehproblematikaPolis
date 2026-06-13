import { Bell, LogOut, Search } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleLabels } from "@/lib/labels";
import type { Profile } from "@/types/domain";

export function Topbar({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Пошук заявки, об'єкта або виконавця" />
        </div>
        <Button variant="outline" size="icon" aria-label="Сповіщення">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium">{profile.full_name}</div>
          <div className="text-xs text-muted-foreground">{roleLabels[profile.role]}</div>
        </div>
        <form action={logoutAction}>
          <Button variant="outline" size="icon" aria-label="Вийти">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
