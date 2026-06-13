import { Card, CardContent } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="page-shell space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-stone-800" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 pt-5">
              <div className="h-4 w-24 animate-pulse rounded bg-stone-800" />
              <div className="h-8 w-12 animate-pulse rounded bg-stone-800" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
