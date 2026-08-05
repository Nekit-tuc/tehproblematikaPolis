import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { Button, Card, Field, Pill, SectionTitle } from "./src/components/ui";
import { directorEmailFromPhone, isValidDirectorPhone, normalizeDirectorPhone } from "./src/lib/director-auth";
import {
  createDirectorTicket,
  getActiveCategories,
  getCurrentProfile,
  getDirectorTickets,
  type Category,
  type Profile,
  type StoreObject,
  type Ticket,
} from "./src/lib/director-api";
import { hasMobileSupabaseEnv, mobileSupabaseEnvError, supabase } from "./src/lib/supabase";
import { colors } from "./src/theme";

type Screen = "home" | "tickets" | "new" | "acts" | "profile";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }
    getCurrentProfile(session.user.id)
      .then(setProfile)
      .catch((nextError: Error) => setError(nextError.message));
  }, [session?.user.id]);

  if (!hasMobileSupabaseEnv && __DEV__ && mobileSupabaseEnvError) {
    console.warn("[mobile-supabase-env]", mobileSupabaseEnvError);
  }
  if (!hasMobileSupabaseEnv && mobileSupabaseEnvError) return <MessageScreen title="Supabase" text={mobileSupabaseEnvError} />;
  if (!hasMobileSupabaseEnv) return <MessageScreen title="Потрібне налаштування" text="Додайте EXPO_PUBLIC_SUPABASE_URL і EXPO_PUBLIC_SUPABASE_ANON_KEY у mobile/.env." />;
  if (booting) return <MessageScreen title="Service Desk AI" text="Запускаємо мобільний кабінет..." loading />;
  if (!session) return <LoginScreen />;
  if (error) return <MessageScreen title="Помилка" text={error} actionLabel="Вийти" onAction={() => supabase.auth.signOut()} />;
  if (!profile) return <MessageScreen title="Профіль" text="Завантажуємо профіль..." loading />;
  if (profile.role !== "store_director") return <MessageScreen title="Не той вхід" text="Мобільний кабінет зараз доступний для директорів магазинів." actionLabel="Вийти" onAction={() => supabase.auth.signOut()} />;
  if (!profile.is_active || profile.approval_status === "pending") return <MessageScreen title="Очікує підтвердження" text="Ваш акаунт ще перевіряє адміністратор." actionLabel="Вийти" onAction={() => supabase.auth.signOut()} />;
  if (profile.approval_status === "rejected") return <MessageScreen title="Доступ відхилено" text="Зверніться до адміністратора системи." actionLabel="Вийти" onAction={() => supabase.auth.signOut()} />;

  return <DirectorMobileApp profile={profile} />;
}

function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    const phoneInput = phone.trim();
    const loginPassword = password.trim();
    if (!isValidDirectorPhone(phoneInput) || !loginPassword) {
      Alert.alert("Перевірте дані", "Вкажіть робочий телефон і пароль.");
      return;
    }
    const normalizedPhone = normalizeDirectorPhone(phoneInput);
    const directorEmail = directorEmailFromPhone(phoneInput);
    if (__DEV__) {
      console.log("[director-mobile-auth] sign-in input", { normalizedPhone, directorEmail });
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: directorEmail, password: loginPassword });
    setLoading(false);
    if (error && __DEV__) {
      console.warn("[director-mobile-auth] Supabase sign-in failed", {
        message: error.message,
        name: error.name,
        status: error.status,
      });
    }
    if (error) Alert.alert("Не вдалося увійти", "Телефон або пароль неправильні.");
  }

  return (
    <AppBackground>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.loginContent, { paddingTop: Math.max(insets.top, 18) + 18, paddingBottom: Math.max(insets.bottom, 18) + 18 }]}
        >
          <View style={styles.loginBrand}>
            <Text style={styles.brandText}>ПОЛІССЯ</Text>
            <Text style={styles.loginTitle}>Вхід для директорів</Text>
            <Text style={styles.loginSubtitle}>Створюйте заявки по магазинах та відстежуйте їх виконання.</Text>
          </View>
          <Card style={styles.formCard}>
            <Field label="Робочий номер телефону" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+380..." autoCapitalize="none" />
            <Field label="Пароль" value={password} onChangeText={setPassword} placeholder="Ваш пароль" secureTextEntry />
            <Button loading={loading} onPress={login}>Увійти</Button>
          </Card>
          <Text style={styles.loginHint}>Реєстрація директора доступна у веб-версії: /director/register</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusBar style="light" />
    </AppBackground>
  );
}

function DirectorMobileApp({ profile }: { profile: Profile }) {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("home");
  const [objects, setObjects] = useState<StoreObject[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [ticketData, categoryData] = await Promise.all([getDirectorTickets(profile.id), getActiveCategories()]);
      setObjects(ticketData.objects);
      setTickets(ticketData.tickets);
      setCategories(categoryData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не вдалося завантажити дані.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const activeCount = tickets.filter((ticket) => !["done", "cancelled", "rejected"].includes(ticket.status)).length;
  const doneCount = tickets.filter((ticket) => ticket.status === "done").length;
  const actCount = tickets.filter((ticket) => ticket.hasAct).length;
  const latestTickets = tickets.slice(0, 5);

  return (
    <AppBackground>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />}
        contentContainerStyle={[styles.appContent, { paddingTop: Math.max(insets.top, 10) + 6, paddingBottom: Math.max(insets.bottom, 16) + 112 }]}
      >
        <DirectorHeader profile={profile} />
        {error ? <Card style={styles.errorCard}><Text selectable style={styles.errorText}>{error}</Text></Card> : null}
        {screen === "home" ? (
          <HomeScreen profile={profile} objects={objects} tickets={latestTickets} activeCount={activeCount} doneCount={doneCount} actCount={actCount} setScreen={setScreen} onRefresh={refresh} />
        ) : null}
        {screen === "tickets" ? <TicketsScreen tickets={tickets} onRefresh={refresh} /> : null}
        {screen === "new" ? (
          <NewTicketScreen profile={profile} objects={objects} categories={categories} onCreated={async () => { await refresh(); setScreen("home"); }} />
        ) : null}
        {screen === "acts" ? <ActsScreen tickets={tickets} /> : null}
        {screen === "profile" ? <ProfileScreen profile={profile} objects={objects} /> : null}
      </ScrollView>
      <BottomNav screen={screen} setScreen={setScreen} activeCount={activeCount} bottomInset={insets.bottom} />
      <StatusBar style="light" />
    </AppBackground>
  );
}

function DirectorHeader({ profile }: { profile: Profile }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.brandText}>ПОЛІССЯ</Text>
        <Text numberOfLines={1} style={styles.headerTitle}>Кабінет директора</Text>
        <Text numberOfLines={1} style={styles.headerSubtitle}>Контроль заявок магазину</Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(profile.full_name)}</Text>
      </View>
    </View>
  );
}

function HomeScreen({
  profile,
  objects,
  tickets,
  activeCount,
  doneCount,
  actCount,
  setScreen,
  onRefresh,
}: {
  profile: Profile;
  objects: StoreObject[];
  tickets: Ticket[];
  activeCount: number;
  doneCount: number;
  actCount: number;
  setScreen: (screen: Screen) => void;
  onRefresh: () => void;
}) {
  const firstName = firstNameOf(profile.full_name);
  return (
    <>
      <HeroCard firstName={firstName} objects={objects} onCreate={() => setScreen("new")} />
      <View style={styles.kpiRow}>
        <Kpi label="Активні" value={activeCount} />
        <Kpi label="Виконані" value={doneCount} />
        <Kpi label="Акти" value={actCount} />
      </View>
      <SectionTitle title="Мої заявки" action={<Text onPress={onRefresh} style={styles.sectionAction}>Оновити</Text>} />
      {tickets.length ? tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : <EmptyCard text="Заявок поки немає." />}
    </>
  );
}

function HeroCard({ firstName, objects, onCreate }: { firstName: string; objects: StoreObject[]; onCreate: () => void }) {
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroIcon}>
        <Text style={styles.heroIconText}>♕</Text>
      </View>
      <Text style={styles.heroTitle}>Вітаю, {firstName}</Text>
      <Text style={styles.heroSubtitle}>{objects.length} {storeWord(objects.length)} під контролем</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
        {objects.length ? objects.map((object) => <StoreChip key={object.id} object={object} />) : <StoreChip object={{ id: "empty", name: "Магазини очікують підтвердження", object_number: null, address: "", city: null, district: null }} />}
      </ScrollView>
      <Button onPress={onCreate}>+ Створити заявку</Button>
    </Card>
  );
}

function TicketsScreen({ tickets, onRefresh }: { tickets: Ticket[]; onRefresh: () => void }) {
  return (
    <>
      <SectionTitle title="Заявки" action={<Text onPress={onRefresh} style={styles.sectionAction}>Оновити</Text>} />
      {tickets.length ? tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : <EmptyCard text="Заявок за вашими магазинами не знайдено." />}
    </>
  );
}

function NewTicketScreen({ profile, objects, categories, onCreated }: { profile: Profile; objects: StoreObject[]; categories: Category[]; onCreated: () => Promise<void> }) {
  const [objectId, setObjectId] = useState(objects[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!objectId && objects[0]?.id) setObjectId(objects[0].id);
    if (!categoryId && categories[0]?.id) setCategoryId(categories[0].id);
  }, [categories, categoryId, objectId, objects]);

  async function submit() {
    if (!objectId || !categoryId || description.trim().length < 10) {
      Alert.alert("Перевірте заявку", "Оберіть магазин, категорію і коротко опишіть проблему.");
      return;
    }
    setSaving(true);
    try {
      await createDirectorTicket({ profile, objectId, categoryId, phone, description });
      setDescription("");
      Alert.alert("Заявку створено", "Вона очікує перевірки адміністратора.");
      await onCreated();
    } catch (error) {
      Alert.alert("Не вдалося створити заявку", error instanceof Error ? error.message : "Спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionTitle title="Створити заявку" />
      <Card style={styles.formCard}>
        <ChoiceRow title="Магазин" items={objects} selectedId={objectId} getLabel={(item) => objectLabel(item)} onSelect={setObjectId} />
        <ChoiceRow title="Категорія" items={categories} selectedId={categoryId} getLabel={(item) => shortCategory(item.name)} onSelect={setCategoryId} />
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Опис проблеми" value={description} onChangeText={setDescription} multiline placeholder="Опишіть проблему коротко: що сталося і де саме." />
        <Button loading={saving} onPress={submit}>Відправити заявку</Button>
      </Card>
    </>
  );
}

function ActsScreen({ tickets }: { tickets: Ticket[] }) {
  const acts = tickets.filter((ticket) => ticket.hasAct);
  return (
    <>
      <SectionTitle title="Акти робіт" />
      {acts.length ? acts.map((ticket) => <ActCard key={ticket.id} ticket={ticket} />) : <EmptyCard text="Актів поки немає." />}
    </>
  );
}

function ProfileScreen({ profile, objects }: { profile: Profile; objects: StoreObject[] }) {
  return (
    <>
      <SectionTitle title="Профіль" />
      <Card style={styles.formCard}>
        <Info label="Ім'я" value={profile.full_name} />
        <Info label="Телефон" value={profile.phone ?? "Не вказано"} />
        <Info label="Магазинів" value={String(objects.length)} />
        <View style={styles.storeList}>
          {objects.map((object) => <StoreChip key={object.id} object={object} />)}
        </View>
        <Button variant="danger" onPress={() => supabase.auth.signOut()}>Вийти</Button>
      </Card>
    </>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const tone = statusTone(ticket.status);
  return (
    <Card style={styles.ticketCard}>
      <View style={styles.ticketTopRow}>
        <View style={styles.ticketTitleBlock}>
          <Text selectable numberOfLines={1} style={styles.ticketNumber}>{ticket.number}</Text>
          <Text numberOfLines={1} style={styles.ticketAddress}>{ticket.object ? objectLabel(ticket.object) : "Магазин"}</Text>
        </View>
        <Pill tone={tone}>{shortStatus(ticket.status, ticket.isInPlan, Boolean(ticket.sent_to_worker_at))}</Pill>
      </View>
      <Text numberOfLines={2} style={styles.ticketDescription}>{ticket.description || ticket.title || "Без опису"}</Text>
      <View style={styles.ticketPills}>
        <Pill tone="gray">{shortCategory(ticket.category?.name)}</Pill>
        {ticket.hasAct ? <Pill tone="green">Акт створено</Pill> : null}
      </View>
    </Card>
  );
}

function ActCard({ ticket }: { ticket: Ticket }) {
  return (
    <Card style={styles.ticketCard}>
      <View style={styles.ticketTopRow}>
        <View style={styles.ticketTitleBlock}>
          <Text selectable numberOfLines={1} style={styles.ticketNumber}>{ticket.number}</Text>
          <Text numberOfLines={1} style={styles.ticketAddress}>{ticket.object ? objectLabel(ticket.object) : "Магазин"}</Text>
        </View>
        <Pill tone="green">Excel</Pill>
      </View>
      <Text numberOfLines={2} style={styles.ticketDescription}>{ticket.description || ticket.title || "Акт виконаних робіт"}</Text>
      <Text style={styles.smallMuted}>{ticket.completed_at ? `Виконано: ${formatDateShort(ticket.completed_at)}` : "Дата виконання уточнюється"}</Text>
    </Card>
  );
}

function ChoiceRow<T extends { id: string }>({ title, items, selectedId, getLabel, onSelect }: { title: string; items: T[]; selectedId: string; getLabel: (item: T) => string; onSelect: (id: string) => void }) {
  return (
    <View style={styles.choiceWrap}>
      <Text style={styles.choiceTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <Pressable key={item.id} onPress={() => onSelect(item.id)} style={({ pressed }) => [styles.choiceChip, active && styles.choiceChipActive, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={[styles.choiceText, active && styles.choiceTextActive]}>{getLabel(item)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BottomNav({ screen, setScreen, activeCount, bottomInset }: { screen: Screen; setScreen: (screen: Screen) => void; activeCount: number; bottomInset: number }) {
  const items: Array<{ key: Screen; label: string; icon: string; center?: boolean }> = [
    { key: "home", label: "Головна", icon: "⌂" },
    { key: "tickets", label: "Заявки", icon: "▤" },
    { key: "new", label: "", icon: "+", center: true },
    { key: "acts", label: "Акти", icon: "□" },
    { key: "profile", label: "Профіль", icon: "○" },
  ];
  return (
    <View style={[styles.navWrap, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <View style={styles.navBar}>
        {items.map((item) => {
          const active = screen === item.key;
          return (
            <Pressable key={item.key} onPress={() => setScreen(item.key)} style={({ pressed }) => [styles.navItem, item.center && styles.navCenterItem, pressed && styles.pressed]}>
              <View style={[item.center ? styles.navPlus : styles.navIconWrap, active && !item.center && styles.navIconActive]}>
                <Text style={[item.center ? styles.navPlusText : styles.navIcon, active && !item.center && styles.navActiveText]}>{item.icon}</Text>
              </View>
              {item.label ? <Text numberOfLines={1} style={[styles.navLabel, active && styles.navActiveText]}>{item.label}</Text> : null}
              {item.key === "tickets" && activeCount > 0 ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{Math.min(activeCount, 99)}</Text></View> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AppBackground({ children }: { children: React.ReactNode }) {
  return <View style={styles.background}>{children}</View>;
}

function MessageScreen({ title, text, actionLabel, onAction, loading = false }: { title: string; text: string; actionLabel?: string; onAction?: () => void; loading?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <AppBackground>
      <View style={[styles.messageWrap, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Card style={styles.messageCard}>
          {loading ? <ActivityIndicator color={colors.orange} /> : null}
          <Text style={styles.messageTitle}>{title}</Text>
          <Text selectable style={styles.messageText}>{text}</Text>
          {actionLabel && onAction ? <Button variant="danger" onPress={onAction}>{actionLabel}</Button> : null}
        </Card>
      </View>
      <StatusBar style="light" />
    </AppBackground>
  );
}

function StoreChip({ object }: { object: StoreObject }) {
  return (
    <View style={styles.storeChip}>
      <Text numberOfLines={1} style={styles.storeChipText}>{objectLabel(object)}</Text>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.kpiLabel}>{label}</Text>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  );
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "Д").toUpperCase();
}

function firstNameOf(name?: string | null) {
  return (name ?? "").trim().split(/\s+/).filter(Boolean)[0] || "директоре";
}

function objectLabel(object: StoreObject) {
  return object.address || object.name || object.object_number || "Магазин";
}

function storeWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "магазин";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "магазини";
  return "магазинів";
}

function shortCategory(name?: string | null) {
  if (!name) return "Без категорії";
  const value = name.toLowerCase();
  if (value.includes("буд") && (value.includes("звар") || value.includes("ремонт"))) return "Буд-роботи";
  if (value.includes("вікна") || value.includes("двер")) return "Вікна/двері";
  if (name.length > 24) return `${name.slice(0, 22).trim()}...`;
  return name;
}

function shortStatus(status: string, isInPlan: boolean, sentToWorker: boolean) {
  if (status === "done") return "Виконана";
  if (status === "rejected" || status === "cancelled") return "Відхилена";
  if (status === "waiting_admin_confirmation") return "На підтвердженні";
  if (status === "in_progress") return "В роботі";
  if (sentToWorker) return "Передана";
  if (isInPlan) return "У плані";
  if (status === "pending_review") return "На перевірці";
  return "Підтверджена";
}

function statusTone(status: string): "orange" | "green" | "blue" | "red" | "gray" {
  if (status === "done") return "green";
  if (status === "in_progress" || status === "waiting_admin_confirmation") return "blue";
  if (status === "rejected" || status === "cancelled") return "red";
  return "orange";
}

function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appContent: {
    paddingHorizontal: 14,
    gap: 13,
  },
  loginContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 18,
  },
  loginBrand: {
    gap: 6,
  },
  brandText: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 4,
  },
  loginTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
  },
  loginSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  loginHint: {
    color: colors.dim,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  header: {
    minHeight: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
  },
  avatarText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  heroCard: {
    padding: 18,
    gap: 11,
    borderRadius: 28,
    backgroundColor: colors.card,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  heroIconText: {
    color: colors.orange,
    fontSize: 30,
    fontWeight: "900",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 16,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 4,
  },
  storeChip: {
    maxWidth: 230,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  storeChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minHeight: 96,
    padding: 12,
    gap: 5,
    justifyContent: "center",
  },
  kpiValue: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionAction: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: "800",
  },
  ticketCard: {
    padding: 18,
    gap: 10,
    borderRadius: 24,
  },
  ticketTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  ticketTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  ticketNumber: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  ticketAddress: {
    color: colors.muted,
    fontSize: 13,
  },
  ticketDescription: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 23,
  },
  ticketPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallMuted: {
    color: colors.muted,
    fontSize: 13,
  },
  formCard: {
    gap: 14,
    padding: 18,
  },
  choiceWrap: {
    gap: 8,
  },
  choiceTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  choiceChip: {
    maxWidth: 230,
    minHeight: 42,
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  choiceChipActive: {
    borderColor: colors.orange,
    backgroundColor: colors.amberSoft,
  },
  choiceText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  choiceTextActive: {
    color: colors.orange,
  },
  storeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
  },
  emptyCard: {
    minHeight: 92,
    justifyContent: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
  errorCard: {
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(127,29,29,0.20)",
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
  },
  navWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "rgba(5,5,5,0.82)",
  },
  navBar: {
    minHeight: 72,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(9,9,11,0.96)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navItem: {
    minWidth: 58,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    gap: 2,
  },
  navCenterItem: {
    marginTop: -26,
  },
  navIconWrap: {
    width: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  navIconActive: {
    backgroundColor: colors.amberSoft,
  },
  navIcon: {
    color: colors.muted,
    fontSize: 20,
    fontWeight: "900",
  },
  navLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  navActiveText: {
    color: colors.orange,
  },
  navPlus: {
    width: 58,
    height: 58,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange,
  },
  navPlusText: {
    color: "#111111",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
  },
  navBadge: {
    position: "absolute",
    top: 2,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange2,
  },
  navBadgeText: {
    color: "#111111",
    fontSize: 10,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
  messageWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  messageCard: {
    gap: 12,
  },
  messageTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  messageText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
