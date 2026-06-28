"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AiGroupMessageAnalysis } from "@/types/ai";

const exampleText = "Добрий день. Шевченка,43 потрібно прочистить унітаз(дуже гуде, та набирається вода), прикрутити ручку в кабінеті керуючої";

type ApiResponse = {
  ok: boolean;
  data?: AiGroupMessageAnalysis;
  error?: string;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function AiTestClient() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AiGroupMessageAnalysis | null>(null);
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
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Не вдалося виконати аналіз.");
        }
        setResult(payload.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Не вдалося виконати аналіз.");
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Текст повідомлення з Telegram-групи</CardTitle>
          <CardDescription>Ця форма тільки тестує аналіз. Заявки не створюються.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Вставте повідомлення з Telegram-групи"
            className="min-h-56"
          />
          {error ? <Alert title="Помилка">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={analyze} disabled={isPending}>
              {isPending ? "Аналіз..." : "Аналізувати"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setText(exampleText)}>
              Заповнити прикладом
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {!result ? (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">Результат аналізу з'явиться тут.</CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Результат аналізу</CardTitle>
                <CardDescription>{result.reason}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Info label="Це заявка" value={result.isTicketMessage ? "Так" : "Ні"} />
                <Info label="Confidence" value={percent(result.confidence)} />
                <Info label="Об'єкт" value={result.objectName ?? "-"} />
                <Info label="Адреса" value={result.address ?? "-"} />
                <Info label="Missing fields" value={result.missingFields.length ? result.missingFields.join(", ") : "-"} />
              </CardContent>
            </Card>

            {result.tickets.length > 0 ? (
              <div className="grid gap-4">
                {result.tickets.map((ticket, index) => (
                  <Card key={`${ticket.title}-${index}`}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>{ticket.title}</CardTitle>
                        <Badge tone={ticket.priority === "critical" ? "red" : ticket.priority === "high" ? "orange" : "gray"}>{ticket.priority}</Badge>
                      </div>
                      <CardDescription>{ticket.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                      <Info label="Категорія" value={ticket.category} />
                      <Info label="Підрозділ" value={ticket.recommendedDepartment ?? "-"} />
                      <Info label="Confidence" value={percent(ticket.confidence)} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>JSON</CardTitle>
                <CardDescription>Повна відповідь `/api/ai/classify`.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[520px] overflow-auto rounded-md border border-border bg-stone-950/60 p-4 text-xs leading-5 text-stone-200">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-stone-950/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}
