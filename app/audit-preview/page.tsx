import type { Metadata } from "next";
import type { ElementType, ReactNode } from "react";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "crypto";
import { AlertTriangle, BarChart3, Bell, Building2, CalendarDays, CheckCircle2, ClipboardList, Home, Lock, MapPin, Plus, UserRound } from "lucide-react";

export const metadata: Metadata = {
  title: "Audit Preview | Polissya Service Desk AI",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type SearchParams = {
  token?: string;
};

type PreviewTicket = {
  number: string;
  title: string;
  object: string;
  address: string;
  category: string;
  worker: string;
  status: "Нова" | "В роботі" | "Виконана" | "Очікує підтвердження";
  priority: "Низький" | "Середній" | "Високий";
};

type PreviewPlan = {
  title: string;
  worker: string;
  tickets: number;
  done: number;
  status: "Чернетка" | "Надіслано" | "В роботі";
};

type PreviewObject = {
  name: string;
  address: string;
  district: string;
  status: "Активний" | "Неактивний";
};

const tickets: PreviewTicket[] = [
  { number: "PSD-2026-0071", title: "Замінити замки в камерах схову", object: "Магазин Миру", address: "проспект Миру, 22", category: "Будівельні роботи", worker: "Нікіта Ковалик", status: "Виконана", priority: "Середній" },
  { number: "PSD-2026-0070", title: "Не працює холодильник", object: "Магазин Київська", address: "вул. Київська, 45", category: "Електрика", worker: "Сергій Мельник", status: "В роботі", priority: "Високий" },
  { number: "PSD-2026-0069", title: "Протікає кран у санвузлі", object: "Магазин Перемоги", address: "вул. Перемоги, 10", category: "Сантехніка", worker: "Олександр Ткаченко", status: "Очікує підтвердження", priority: "Низький" },
  { number: "PSD-2026-0068", title: "Потрібна заміна ручки в торговому залі", object: "Магазин Богунія", address: "район Богунія", category: "Вікна / двері / фурнітура", worker: "Віталій", status: "Нова", priority: "Середній" },
  { number: "PSD-2026-0067", title: "Закріпити плитку на вході", object: "Магазин Небесна сотня", address: "вул. Небесна сотня, 30", category: "Буд-роботи", worker: "Максим", status: "В роботі", priority: "Середній" },
];

const plans: PreviewPlan[] = [
  { title: "Денис — сантехніка", worker: "Денис", tickets: 16, done: 4, status: "В роботі" },
  { title: "Лена — каналізація", worker: "Лена", tickets: 12, done: 8, status: "Надіслано" },
  { title: "Максим — будівельні роботи", worker: "Максим", tickets: 8, done: 0, status: "Чернетка" },
];

const objects: PreviewObject[] = [
  { name: "Магазин Богунія", address: "м. Житомир, район Богунія", district: "Богунія", status: "Активний" },
  { name: "Магазин Небесна сотня 30", address: "м. Житомир, вул. Небесна сотня, 30", district: "Центр", status: "Активний" },
  { name: "Центральний склад", address: "м. Житомир, центральний склад", district: "Склад", status: "Активний" },
  { name: "Офіс управління", address: "м. Житомир, офіс", district: "Центр", status: "Активний" },
];

function hasValidToken(token?: string) {
  const expectedToken = process.env.AUDIT_PREVIEW_TOKEN;
  if (!expectedToken || !token) return false;

  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(token);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function statusClass(status: PreviewTicket["status"] | PreviewPlan["status"] | PreviewObject["status"]) {
  if (status === "Виконана" || status === "Надіслано" || status === "Активний") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "В роботі") return "border-blue-400/20 bg-blue-500/10 text-blue-300";
  if (status === "Очікує підтвердження" || status === "Чернетка") return "border-orange-400/20 bg-orange-500/10 text-orange-300";
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
}

function priorityClass(priority: PreviewTicket["priority"]) {
  if (priority === "Високий") return "bg-red-500/15 text-red-300";
  if (priority === "Середній") return "bg-orange-500/15 text-orange-300";
  return "bg-zinc-500/15 text-zinc-300";
}

function DisabledAction({ children }: { children: ReactNode }) {
  return (
    <button type="button" disabled title="Недоступно в audit preview" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 text-[11px] font-semibold text-zinc-500 opacity-70">
      <Lock className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export default async function AuditPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  if (!hasValidToken(params.token)) notFound();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070707] text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.08] bg-[#070707]/88 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-orange-400">Polissya</p>
              <h1 className="mt-1 text-xl font-black tracking-[-0.04em] text-white sm:text-3xl">Service Desk AI</h1>
              <p className="mt-1 text-xs text-zinc-400">Безпечний read-only audit preview на демо-даних.</p>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.05] text-orange-300">
              <Bell className="h-5 w-5" />
            </div>
          </div>
        </header>

        <section className="mt-5 rounded-[24px] border border-orange-400/20 bg-orange-500/[0.07] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.35)]">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-orange-100">Audit Preview</h2>
              <p className="mt-1 text-xs leading-5 text-orange-100/72">
                Це демонстраційний перегляд без реальних production-даних. Створення, редагування, видалення, Telegram-відправка та exports вимкнені.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={ClipboardList} label="Заявки тижня" value="46" hint="+12% до минулого тижня" />
          <KpiCard icon={CheckCircle2} label="Виконано" value="31" hint="67% завершення" />
          <KpiCard icon={CalendarDays} label="Планів робіт" value="7" hint="3 надіслано виконавцям" />
          <KpiCard icon={Building2} label="Об'єктів" value="38" hint="37 активних" />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <PreviewPanel title="Заявки" subtitle="Демо-список останніх звернень" action={<DisabledAction>Дії вимкнені</DisabledAction>}>
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <article key={ticket.number} className="rounded-[20px] border border-white/[0.09] bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white">{ticket.number}</p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-zinc-100">{ticket.title}</h3>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-zinc-400 sm:grid-cols-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ticket.address}</span></span>
                    <span className="inline-flex min-w-0 items-center gap-1.5"><UserRound className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ticket.worker}</span></span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-zinc-300">{ticket.category}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(ticket.status)}`}>{ticket.status}</span>
                  </div>
                </article>
              ))}
            </div>
          </PreviewPanel>

          <div className="space-y-5">
            <PreviewPanel title="Планування робіт" subtitle="Тижневі плани виконавців" action={<DisabledAction>Excel demo</DisabledAction>}>
              <div className="rounded-[22px] border border-white/[0.10] bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.13),transparent_35%),rgba(255,255,255,0.04)] p-4 text-center">
                <p className="text-[11px] font-semibold text-orange-300">Плани робіт</p>
                <p className="mt-1 text-2xl font-black text-white">25.07—01.08</p>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Планів" value="7" />
                  <MiniStat label="Заявок" value="32" />
                  <MiniStat label="Чернеток" value="7" />
                  <MiniStat label="Надіслано" value="3" />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {plans.map((plan) => (
                  <div key={plan.title} className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{plan.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">Виконавець: {plan.worker}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(plan.status)}`}>{plan.status}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.round((plan.done / Math.max(plan.tickets, 1)) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">Виконано {plan.done} з {plan.tickets}</p>
                  </div>
                ))}
              </div>
            </PreviewPanel>

            <PreviewPanel title="Об'єкти" subtitle="Демо-довідник локацій">
              <div className="space-y-2">
                {objects.map((object) => (
                  <div key={object.name} className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{object.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{object.address}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(object.status)}`}>{object.status}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">Район: {object.district}</p>
                  </div>
                ))}
              </div>
            </PreviewPanel>
          </div>
        </section>
      </div>

      <nav aria-label="Preview navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.10] bg-[#090909]/92 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1 text-[10px] font-semibold text-zinc-500">
          <PreviewNavItem icon={Home} label="Головна" active />
          <PreviewNavItem icon={ClipboardList} label="Заявки" />
          <div className="-mt-6 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-400 to-orange-600 text-black shadow-[0_10px_28px_rgba(249,115,22,0.36)]">
              <Plus className="h-6 w-6" />
            </span>
          </div>
          <PreviewNavItem icon={CalendarDays} label="Плани" />
          <PreviewNavItem icon={Building2} label="Об'єкти" />
        </div>
      </nav>
    </main>
  );
}

function KpiCard({ icon: Icon, label, value, hint }: { icon: ElementType; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[22px] border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-500/12 text-orange-300">
          <Icon className="h-5 w-5" />
        </span>
        <BarChart3 className="h-4 w-4 text-zinc-600" />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function PreviewPanel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[26px] border border-white/[0.10] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.03em] text-white">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] p-2">
      <p className="text-lg font-black text-white">{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

function PreviewNavItem({ icon: Icon, label, active = false }: { icon: ElementType; label: string; active?: boolean }) {
  return (
    <span className={`flex flex-col items-center gap-1 ${active ? "text-orange-400" : "text-zinc-500"}`}>
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </span>
  );
}
