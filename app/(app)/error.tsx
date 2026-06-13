"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-shell">
      <Card>
        <CardHeader><CardTitle>Не вдалося завантажити дані</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={reset}>Спробувати ще раз</Button>
        </CardContent>
      </Card>
    </div>
  );
}
