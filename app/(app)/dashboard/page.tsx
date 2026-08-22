import Link from "next/link";
import type React from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, Hourglass, ListChecks, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { PlanRefreshModal, type PlanRefreshAutoSummary } from "@/components/dashboard/plan-refresh-modal";
import { requireAuth } from "@/lib/auth/server";
import { getDashboardOverview } from "@/lib/supabase/queries";
import { getDashboardPlanRefreshData } from "@/lib/supabase/dashboard-plan-refresh";

const text = {
  forbiddenTitle: "Недостатньо прав",
  forbiddenBody: "Вашій ролі не відкрито доступ до цього розділу.",
  supabaseTitle: "Дані Supabase недоступні",
  label: "Service Desk AI",
  title: "Контроль магазинів Полісся",
  greeting: "Вітаю",
  workWeek: "Робочий тиждень",
  intakeTitle: "Заявки цього тижня",
  intakeSubtitle: "Заявки, які надійшли від магазинів у поточному робочому тижні",
  executionTitle: "Виконання цього тижня",
  executionSubtitle: "Заявки з планів, які мають виконуватись у поточному робочому тижні",
  viewTickets: "Переглянути заявки",
  openPlans: "Відкрити плани тижня",
  noTickets: "Нових заявок за цей робочий тиждень ще немає.",
  noPlans: "На цей робочий тиждень ще немає активних планів.",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; planRefresh?: string; added?: string; already?: string; skipped?: string; errors?: string; message?: string; details?: string }> }) {
  const params = await searchParams;
  const { profile } = await requireAuth();
  const canRefreshPlans = ["admin", "management", "tech_manager"].includes(profile.role);
  const [result, planRefreshData] = await Promise.all([
    getDashboardOverview(),
    canRefreshPlans ? getDashboardPlanRefreshData() : Promise.resolve(null),
  ]);
  const data = result.data;
  const ticketsHref = `/tickets?from=${data.week.startDate}&to=${data.week.endDate}`;
  const plansHref = `/work-planning?from=${data.week.startDate}&to=${data.week.endDate}`;
  const autoSummary: PlanRefreshAutoSummary | null = params.planRefresh === "auto"
    ? {
        added: params.added ?? "0",
        already: params.already ?? "0",
        skipped: params.skipped ?? "0",
        errors: params.errors ?? "0",
        details: params.details ? params.details.split("\n").filter(Boolean) : [],
      }
    : null;
  const planRefreshActionError = params.planRefresh === "error"
    ? (params.message ?? "Спробуйте ще раз.")
    : null;

  return (
    <div className="page-shell relative mx-auto max-w-6xl overflow-hidden pb-28 md:pb-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative space-y-4 md:space-y-5">
        {params.error === "forbidden" ? <Alert title={text.forbiddenTitle}>{text.forbiddenBody}</Alert> : null}
        {result.error ? <Alert title={text.supabaseTitle}>{result.error}</Alert> : null}
        {params.planRefresh === "error" ? <Alert title="Не вдалося оновити плани">{params.message ?? "Спробуйте ще раз."}</Alert> : null}
        {params.planRefresh === "success" ? (
          <Alert title="Плани оновлено">Додано: {params.added ?? "0"}. Уже були в плані: {params.already ?? "0"}. Пропущено: {params.skipped ?? "0"}. Помилки: {params.errors ?? "0"}.</Alert>
        ) : null}
        {params.planRefresh === "auto" ? (
          <Alert title="Автопланування завершено">Додано: {params.added ?? "0"}. Уже були в плані: {params.already ?? "0"}. Пропущено: {params.skipped ?? "0"}. Помилки: {params.errors ?? "0"}.</Alert>
        ) : null}

        <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300">{text.label}</p>
              <h1 className="mt-1 text-[23px] font-semibold leading-tight text-stone-50 md:text-3xl">{text.title}</h1>
              <p className="mt-2 text-[12px] leading-relaxed text-stone-400 md:text-sm">{text.greeting}, {data.userName}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-left md:text-right">
                <p className="text-[10px] text-orange-200">{text.workWeek}</p>
                <p className="text-[16px] font-semibold text-orange-100 md:text-lg">{data.week.label}</p>
              </div>
              {canRefreshPlans ? <PlanRefreshModal data={planRefreshData?.data ?? null} error={planRefreshData?.error ?? null} autoSummary={autoSummary} actionError={planRefreshActionError} /> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <DashboardBlock
            title={text.intakeTitle}
            subtitle={text.intakeSubtitle}
            icon={ClipboardList}
            actionHref={ticketsHref}
            actionLabel={text.viewTickets}
            empty={data.intake.total === 0 ? text.noTickets : null}
            stats={[
              { label: "Надійшло", value: data.intake.total, icon: ClipboardList, tone: "text-orange-300" },
              { label: "AI-перевірка", value: data.intake.pendingReview, icon: Sparkles, tone: "text-sky-300" },
              { label: "Підтверджено", value: data.intake.confirmed, icon: CheckCircle2, tone: "text-emerald-300" },
              { label: "Очікують планування", value: data.intake.awaitingPlanning, icon: ListChecks, tone: "text-amber-300" },
              { label: "Критичні", value: data.intake.critical, icon: AlertTriangle, tone: "text-red-300" },
            ]}
          />

          <DashboardBlock
            title={text.executionTitle}
            subtitle={text.executionSubtitle}
            icon={CalendarCheck}
            actionHref={plansHref}
            actionLabel={text.openPlans}
            empty={data.execution.planned === 0 ? text.noPlans : null}
            stats={[
              { label: "Заплановано", value: data.execution.planned, icon: CalendarCheck, tone: "text-orange-300" },
              { label: "В роботі", value: data.execution.inProgress, icon: ListChecks, tone: "text-blue-300" },
              { label: "Виконано", value: data.execution.done, icon: CheckCircle2, tone: "text-emerald-300" },
              { label: "На підтвердженні", value: data.execution.waitingConfirmation, icon: Hourglass, tone: "text-amber-300" },
              { label: "Не виконано", value: data.execution.notDone, icon: AlertTriangle, tone: "text-red-300" },
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function DashboardBlock({
  title,
  subtitle,
  icon: Icon,
  stats,
  actionHref,
  actionLabel,
  empty,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  stats: Array<{ label: string; value: number; icon: React.ElementType; tone: string }>;
  actionHref: string;
  actionLabel: string;
  empty: string | null;
}) {
  return (
    <article className="min-w-0 rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20 backdrop-blur md:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10">
          <Icon className="h-4.5 w-4.5 text-orange-300" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-tight text-stone-50 md:text-lg">{title}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-400 md:text-[12px]">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((item) => (
          <KpiTile key={item.label} {...item} />
        ))}
      </div>

      {empty ? <p className="mt-3 rounded-2xl border border-dashed border-white/[0.08] bg-black/15 p-3 text-[11px] leading-relaxed text-stone-500">{empty}</p> : null}

      <Link href={actionHref} className="mt-4 flex h-10 items-center justify-between rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 text-[12px] font-semibold text-orange-100 active:bg-orange-500/15">
        <span>{actionLabel}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ElementType; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
        <p className="text-right text-[22px] font-semibold leading-none text-stone-50">{value}</p>
      </div>
      <p className="break-words text-[10px] font-medium leading-snug text-stone-400">{label}</p>
    </div>
  );
}
