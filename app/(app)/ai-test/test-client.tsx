"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ObjectResolverResult } from "@/lib/ai/object-resolver";
import type { StoreMatchResult } from "@/lib/stores/match-store";
import type { AiGroupMessageAnalysis } from "@/types/ai";

const exampleText =
  "Добрий день. Шевченка,43 потрібно прочистить унітаз(дуже гуде, та набирається вода), прикрутити ручку в кабінеті керуючої";

type ApiResponse = {
  ok: boolean;
  data?: AiGroupMessageAnalysis;
  analysis?: AiGroupMessageAnalysis;
  localStoreMatch?: StoreMatchResult;
  objectResolver?: ObjectResolverResult;
  objectSource?: { source: "supabase_objects" | "static_store_addresses"; count: number; error: string | null };
  aiMode?: "openai" | "fallback";
  mode?: "openai" | "fallback";
  openaiConfigured?: boolean;
  model?: string | null;
  fallbackReason?: string;
  openaiValidationError?: string | null;
  error?: string;
};

type TestResult = {
  localStoreMatch: StoreMatchResult;
  objectResolver?: ObjectResolverResult;
  analysis: AiGroupMessageAnalysis;
  raw: ApiResponse;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function AiTestClient() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function analyze() {
    setError(null);
    setResult(null);
    const message = text.trim();
    if (!message) {
      setError("Введіть текст повідомлення для аналізу.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/ai/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        const payload = (await response.json()) as ApiResponse;
        const analysis = payload.analysis ?? payload.data;
        if (!response.ok || !payload.ok || !analysis || !payload.localStoreMatch) {
          throw new Error(payload.error ?? "Не вдалося виконати аналіз.");
        }
        setResult({ localStoreMatch: payload.localStoreMatch, objectResolver: payload.objectResolver, analysis, raw: payload });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Не вдалося виконати аналіз.");
      }
    });
  }

  const workItems = result?.analysis.workItems.length ? result.analysis.workItems : result?.analysis.tickets ?? [];

  return (
    <div className="grid min-w-0 gap-4 md:gap-6">
      <Card className="max-w-full rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
        <CardHeader>
          <CardTitle>Текст повідомлення з Telegram-групи</CardTitle>
          <CardDescription>Форма тільки тестує AI v2 аналіз. Заявки не створюються.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Вставте повідомлення з Telegram-групи"
            className="min-h-56"
          />
          {error ? <Alert title="Помилка">{error}</Alert> : null}
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button type="button" onClick={analyze} disabled={isPending} className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
              {isPending ? "Аналіз..." : "Аналізувати"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setText(exampleText)} className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
              Заповнити прикладом
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4 md:space-y-6">
        {!result ? (
          <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
            <CardContent className="pt-5 text-sm text-muted-foreground">Результат аналізу з'явиться тут.</CardContent>
          </Card>
        ) : (
          <>
            <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:hidden">
              <CardHeader className="p-4">
                <CardTitle className="text-base">Результат аналізу</CardTitle>
                <CardDescription className="break-words text-xs">{result.analysis.reason}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 pt-0">
                <Info label="Об'єкт" value={result.analysis.objectName ?? "-"} />
                <Info label="Адреса" value={result.analysis.address ?? "-"} />
                <div className="grid grid-cols-2 gap-2">
                  <Info label="Confidence" value={percent(result.analysis.confidence)} />
                  <Info label="Resolver" value={result.objectResolver?.status ?? result.localStoreMatch.status} />
                </div>
                <Info label="Work Items" value={String(workItems.length)} />
                <Info label="AI mode" value={result.raw.aiMode ?? result.raw.mode ?? "-"} />
              </CardContent>
            </Card>

            <Card className="hidden md:block">
              <CardHeader>
                <CardTitle>OpenAI diagnostics</CardTitle>
                <CardDescription>Server-side ENV check for Vercel. API key value is never returned.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Info label="AI mode" value={result.raw.aiMode ?? result.raw.mode ?? "-"} />
                <Info label="OpenAI configured" value={result.raw.openaiConfigured ? "true" : "false"} />
                <Info label="Model" value={result.raw.model ?? "-"} />
                <Info label="Fallback reason" value={result.raw.fallbackReason ?? "-"} />
                <Info label="OpenAI validation" value={result.raw.openaiValidationError ?? "-"} />
                <Info label="Object source" value={result.raw.objectSource?.source ?? "-"} />
                <Info label="Object count" value={String(result.raw.objectSource?.count ?? "-")} />
                {result.raw.objectSource?.error ? <Info label="Object source error" value={result.raw.objectSource.error} /> : null}
              </CardContent>
            </Card>

            <Card className="hidden md:block">
              <CardHeader>
                <CardTitle>Local Object Matcher</CardTitle>
                <CardDescription>{result.localStoreMatch.reason}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Info label="Status" value={result.localStoreMatch.status} />
                  <Info label="Confidence" value={percent(result.localStoreMatch.confidence)} />
                  <Info label="Best match" value={result.localStoreMatch.bestMatch?.name ?? "-"} />
                </div>
                {result.localStoreMatch.candidates.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Кандидати</div>
                    <div className="grid gap-2">
                      {result.localStoreMatch.candidates.map((candidate) => (
                        <div key={candidate.store.id} className="grid min-w-0 gap-3 rounded-md border border-border bg-stone-950/30 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                            <div className="break-words font-medium">{candidate.store.name}</div>
                            <div className="break-words text-xs text-muted-foreground">{candidate.store.address}</div>
                            {candidate.matchedAlias ? <div className="mt-1 break-words text-xs text-muted-foreground">Alias: {candidate.matchedAlias}</div> : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone="gray">{candidate.matchedBy}</Badge>
                              <Badge tone={candidate.score >= 85 ? "green" : candidate.score >= 50 ? "orange" : "gray"}>{candidate.score}</Badge>
                            </div>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <TokenList label="Matched tokens" tokens={candidate.matchedTokens ?? []} />
                            <TokenList label="Missing tokens" tokens={candidate.missingTokens ?? []} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {result.objectResolver ? (
              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle>Object Resolver</CardTitle>
                  <CardDescription>{result.objectResolver.reason}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Info label="Status" value={result.objectResolver.status} />
                    <Info label="Source" value={result.objectResolver.source} />
                    <Info label="Confidence" value={percent(result.objectResolver.confidence)} />
                    <Info label="Best match" value={result.objectResolver.bestMatch?.name ?? "-"} />
                    <Info label="Final object" value={result.analysis.objectName ?? "-"} />
                    <Info label="OpenAI selected" value={result.analysis.openAiSelectedObjectId ?? result.analysis.objectId ?? "-"} />
                    <Info label="Override ignored" value={result.analysis.objectOverrideIgnored ? "true" : "false"} />
                    <Info label="Allowed IDs" value={result.objectResolver.allowedObjectIds.join(", ") || "-"} />
                  </div>
                  <div className="grid gap-2">
                    {result.objectResolver.candidates.map((candidate) => (
                      <div key={`resolver-${candidate.id}`} className="min-w-0 rounded-md border border-border bg-stone-950/30 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="break-words font-medium">{candidate.name}</div>
                            <div className="break-words text-xs text-muted-foreground">{candidate.address}</div>
                            {candidate.matchedAlias ? <div className="mt-1 break-words text-xs text-muted-foreground">Alias: {candidate.matchedAlias}</div> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone="gray">{candidate.matchedBy}</Badge>
                            <Badge tone={candidate.score >= 85 ? "green" : candidate.score >= 50 ? "orange" : "gray"}>{candidate.score}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="hidden md:block">
              <CardHeader>
                <CardTitle>AI v2 analysis</CardTitle>
                <CardDescription>{result.analysis.reason}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Info label="Це заявка" value={result.analysis.isTicketMessage ? "Так" : "Ні"} />
                <Info label="Confidence" value={percent(result.analysis.confidence)} />
                <Info label="Об'єкт" value={result.analysis.objectName ?? "-"} />
                <Info label="Адреса" value={result.analysis.address ?? "-"} />
                <Info label="Work Items" value={String(result.analysis.workItems.length)} />
                <Info label="Tickets alias" value={String(result.analysis.tickets.length)} />
                <Info label="Mode" value={result.raw.aiMode ?? result.raw.mode ?? "-"} />
                <Info label="Model" value={result.raw.model ?? "-"} />
                {result.raw.fallbackReason ? <Info label="Fallback reason" value={result.raw.fallbackReason} /> : null}
                <Info label="Missing fields" value={result.analysis.missingFields.length ? result.analysis.missingFields.join(", ") : "-"} />
              </CardContent>
            </Card>

            {workItems.length > 0 ? (
              <div className="grid min-w-0 gap-3 md:gap-4">
                {workItems.map((item, index) => (
                  <Card key={`${item.title}-${index}`} className="max-w-full rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                    <CardHeader className="p-4 md:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="break-words text-base md:text-xl">{item.title}</CardTitle>
                        <Badge tone={item.priority === "critical" ? "red" : item.priority === "high" ? "orange" : "gray"}>{item.priority}</Badge>
                      </div>
                      <CardDescription className="break-words text-sm">{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 p-4 pt-0 md:grid-cols-3 md:gap-3 md:p-6 md:pt-0">
                      <Info label="Категорія" value={item.category} />
                      <Info label="Тип роботи" value={item.workType} />
                      <Info label="Підрозділ" value={item.recommendedDepartment ?? "-"} />
                      <Info label="Confidence" value={percent(item.confidence)} />
                      <div className="md:col-span-3">
                        <Info label="Reasoning" value={item.reasoning} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <details className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:hidden">
              <summary className="cursor-pointer list-none text-sm font-semibold text-orange-200">Технічні деталі</summary>
              <div className="mt-4 grid min-w-0 gap-3">
                <Info label="OpenAI configured" value={result.raw.openaiConfigured ? "true" : "false"} />
                <Info label="Model" value={result.raw.model ?? "-"} />
                <Info label="Fallback reason" value={result.raw.fallbackReason ?? "-"} />
                <Info label="Object source" value={`${result.raw.objectSource?.source ?? "-"} (${result.raw.objectSource?.count ?? "-"})`} />
                <Info label="Best match" value={result.localStoreMatch.bestMatch?.name ?? "-"} />
                <Info label="Allowed IDs" value={result.objectResolver?.allowedObjectIds.join(", ") || "-"} />
              </div>
            </details>

            <details className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-orange-200">Показати JSON</summary>
              <pre className="mt-4 max-h-[520px] max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-stone-950/60 p-3 text-xs leading-5 text-stone-200 md:p-4">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-border bg-stone-950/30 p-3 md:rounded-lg">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 max-w-full break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function TokenList({ label, tokens }: { label: string; tokens: string[] }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tokens.length > 0 ? tokens.map((token) => <Badge key={`${label}-${token}`} tone="gray">{token}</Badge>) : <span className="text-xs text-muted-foreground">-</span>}
      </div>
    </div>
  );
}
