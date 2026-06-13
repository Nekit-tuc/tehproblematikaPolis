import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { roleLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { getProfiles } from "@/lib/supabase/queries";

export default async function UsersPage() {
  await requireRole(["admin", "management"]);
  const { data: profiles, error } = await getProfiles();

  return (
    <div className="page-shell space-y-6">
      <div><h1 className="text-2xl font-semibold">Користувачі</h1><p className="subtle">Ролі, доступи та активність співробітників.</p></div>
      {error ? <Alert title="Не вдалося завантажити користувачів">{error}</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Команда</CardTitle></CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Користувачів поки немає.</p>
          ) : (
            <Table>
              <THead><TR><TH>ПІБ</TH><TH>Email</TH><TH>Роль</TH><TH>Телефон</TH><TH>Статус</TH></TR></THead>
              <TBody>
                {profiles.map((profile) => (
                  <TR key={profile.id}>
                    <TD className="font-medium">{profile.full_name}</TD>
                    <TD>{profile.email}</TD>
                    <TD>{roleLabels[profile.role]}</TD>
                    <TD>{profile.phone}</TD>
                    <TD><Badge tone={profile.is_active ? "green" : "gray"}>{profile.is_active ? "Активний" : "Неактивний"}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
