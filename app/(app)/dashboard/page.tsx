import Link from "next/link";
import type React from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, Hourglass, ListChecks, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { getDashboardOverview } from "@/lib/supabase/queries";

const text = {
  forbiddenTitle: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043D\u044C\u043E \u043F\u0440\u0430\u0432",
  forbiddenBody: "\u0412\u0430\u0448\u0456\u0439 \u0440\u043E\u043B\u0456 \u043D\u0435 \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u043E \u0434\u043E\u0441\u0442\u0443\u043F \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u0440\u043E\u0437\u0434\u0456\u043B\u0443.",
  supabaseTitle: "\u0414\u0430\u043D\u0456 Supabase \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456",
  label: "Service Desk AI",
  title: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0456\u0432 \u041F\u043E\u043B\u0456\u0441\u0441\u044F",
  greeting: "\u0412\u0456\u0442\u0430\u044E",
  workWeek: "\u0420\u043E\u0431\u043E\u0447\u0438\u0439 \u0442\u0438\u0436\u0434\u0435\u043D\u044C",
  intakeTitle: "\u0417\u0430\u044F\u0432\u043A\u0438 \u0446\u044C\u043E\u0433\u043E \u0442\u0438\u0436\u043D\u044F",
  intakeSubtitle: "\u0417\u0430\u044F\u0432\u043A\u0438, \u044F\u043A\u0456 \u043D\u0430\u0434\u0456\u0439\u0448\u043B\u0438 \u0432\u0456\u0434 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0456\u0432 \u0443 \u043F\u043E\u0442\u043E\u0447\u043D\u043E\u043C\u0443 \u0440\u043E\u0431\u043E\u0447\u043E\u043C\u0443 \u0442\u0438\u0436\u043D\u0456",
  executionTitle: "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043D\u044F \u0446\u044C\u043E\u0433\u043E \u0442\u0438\u0436\u043D\u044F",
  executionSubtitle: "\u0417\u0430\u044F\u0432\u043A\u0438 \u0437 \u043F\u043B\u0430\u043D\u0456\u0432, \u044F\u043A\u0456 \u043C\u0430\u044E\u0442\u044C \u0432\u0438\u043A\u043E\u043D\u0443\u0432\u0430\u0442\u0438\u0441\u044C \u0443 \u043F\u043E\u0442\u043E\u0447\u043D\u043E\u043C\u0443 \u0440\u043E\u0431\u043E\u0447\u043E\u043C\u0443 \u0442\u0438\u0436\u043D\u0456",
  viewTickets: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0437\u0430\u044F\u0432\u043A\u0438",
  openPlans: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u043F\u043B\u0430\u043D\u0438 \u0442\u0438\u0436\u043D\u044F",
  noTickets: "\u041D\u043E\u0432\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u0437\u0430 \u0446\u0435\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u0442\u0438\u0436\u0434\u0435\u043D\u044C \u0449\u0435 \u043D\u0435\u043C\u0430\u0454.",
  noPlans: "\u041D\u0430 \u0446\u0435\u0439 \u0440\u043E\u0431\u043E\u0447\u0438\u0439 \u0442\u0438\u0436\u0434\u0435\u043D\u044C \u0449\u0435 \u043D\u0435\u043C\u0430\u0454 \u0430\u043A\u0442\u0438\u0432\u043D\u0438\u0445 \u043F\u043B\u0430\u043D\u0456\u0432.",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const result = await getDashboardOverview();
  const data = result.data;
  const ticketsHref = `/tickets?from=${data.week.startDate}&to=${data.week.endDate}`;
  const plansHref = `/work-planning?from=${data.week.startDate}&to=${data.week.endDate}`;

  return (
    <div className="page-shell relative mx-auto max-w-6xl overflow-hidden pb-28 md:pb-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative space-y-4 md:space-y-5">
        {params.error === "forbidden" ? <Alert title={text.forbiddenTitle}>{text.forbiddenBody}</Alert> : null}
        {result.error ? <Alert title={text.supabaseTitle}>{result.error}</Alert> : null}

        <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300">{text.label}</p>
              <h1 className="mt-1 text-[23px] font-semibold leading-tight text-stone-50 md:text-3xl">{text.title}</h1>
              <p className="mt-2 text-[12px] leading-relaxed text-stone-400 md:text-sm">{text.greeting}, {data.userName}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-left md:text-right">
              <p className="text-[10px] text-orange-200">{text.workWeek}</p>
              <p className="text-[16px] font-semibold text-orange-100 md:text-lg">{data.week.label}</p>
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
              { label: "\u041D\u0430\u0434\u0456\u0439\u0448\u043B\u043E", value: data.intake.total, icon: ClipboardList, tone: "text-orange-300" },
              { label: "AI-\u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430", value: data.intake.pendingReview, icon: Sparkles, tone: "text-sky-300" },
              { label: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043E", value: data.intake.confirmed, icon: CheckCircle2, tone: "text-emerald-300" },
              { label: "\u041E\u0447\u0456\u043A\u0443\u044E\u0442\u044C \u043F\u043B\u0430\u043D\u0443\u0432\u0430\u043D\u043D\u044F", value: data.intake.awaitingPlanning, icon: ListChecks, tone: "text-amber-300" },
              { label: "\u041A\u0440\u0438\u0442\u0438\u0447\u043D\u0456", value: data.intake.critical, icon: AlertTriangle, tone: "text-red-300" },
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
              { label: "\u0417\u0430\u043F\u043B\u0430\u043D\u043E\u0432\u0430\u043D\u043E", value: data.execution.planned, icon: CalendarCheck, tone: "text-orange-300" },
              { label: "\u0412 \u0440\u043E\u0431\u043E\u0442\u0456", value: data.execution.inProgress, icon: ListChecks, tone: "text-blue-300" },
              { label: "\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E", value: data.execution.done, icon: CheckCircle2, tone: "text-emerald-300" },
              { label: "\u041D\u0430 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u0456", value: data.execution.waitingConfirmation, icon: Hourglass, tone: "text-amber-300" },
              { label: "\u041D\u0435 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E", value: data.execution.notDone, icon: AlertTriangle, tone: "text-red-300" },
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
