import type { ObjectType } from "@/types/domain";

export type StoreAddress = {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  aliases: string[];
  objectType: ObjectType;
};

// Тимчасовий локальний довідник об'єктів для Telegram group intake.
// Пізніше цей файл можна замінити на таблицю Supabase `objects` з aliases/address matching.
export const storeAddresses: StoreAddress[] = [
  {
    id: "store_boguniya_001",
    name: "Магазин Богунія",
    city: "Житомир",
    district: "Богунія",
    address: "м. Житомир, район Богунія",
    aliases: ["Богунія", "Богуния", "магазин Богунія", "Богунія магазин"],
    objectType: "store",
  },
  {
    id: "store_vokzal_001",
    name: "Магазин Вокзал",
    city: "Житомир",
    district: "Вокзал",
    address: "м. Житомир, район Вокзал",
    aliases: ["Вокзал", "магазин Вокзал", "біля вокзалу"],
    objectType: "store",
  },
  {
    id: "store_global_001",
    name: "Магазин Глобал",
    city: "Житомир",
    district: "Глобал",
    address: "м. Житомир, ТРЦ Глобал",
    aliases: ["Глобал", "магазин Глобал", "ТРЦ Глобал", "Global"],
    objectType: "store",
  },
  {
    id: "store_shevchenka_043",
    name: "Магазин Шевченка 43",
    city: "Житомир",
    district: "Центр",
    address: "м. Житомир, вул. Шевченка, 43",
    aliases: ["Шевченка 43", "Шевченка,43", "Шевченка, 43", "магазин Шевченка 43"],
    objectType: "store",
  },
  {
    id: "store_hlibna_022",
    name: "Магазин Хлібна 22",
    city: "Житомир",
    district: "Центр",
    address: "м. Житомир, вул. Хлібна, 22",
    aliases: ["Хлібна 22", "Хлібна,22", "Хлібна, 22", "Хлебная 22", "магазин Хлібна 22"],
    objectType: "store",
  },
  {
    id: "store_kyivska_057",
    name: "Магазин Київська 57",
    city: "Житомир",
    district: "Центр",
    address: "м. Житомир, вул. Київська, 57",
    aliases: ["Київська 57", "Киевская 57", "магазин Київська 57", "Київська, 57"],
    objectType: "store",
  },
  {
    id: "store_kyivska_088",
    name: "Магазин Київська 88",
    city: "Житомир",
    district: "Центр",
    address: "м. Житомир, вул. Київська, 88",
    aliases: ["Київська 88", "Киевская 88", "магазин Київська 88", "Київська, 88"],
    objectType: "store",
  },
  {
    id: "warehouse_main_001",
    name: "Центральний склад",
    city: "Житомир",
    district: "Промзона",
    address: "м. Житомир, центральний склад",
    aliases: ["Склад", "центральний склад", "складі"],
    objectType: "warehouse",
  },
  {
    id: "office_main_001",
    name: "Головний офіс",
    city: "Житомир",
    district: "Центр",
    address: "м. Житомир, головний офіс",
    aliases: ["Офіс", "головний офіс", "офісі"],
    objectType: "office",
  },
  {
    id: "production_main_001",
    name: "Виробництво",
    city: "Житомир",
    district: "Промзона",
    address: "м. Житомир, виробництво",
    aliases: ["Виробництво", "цех", "виробничий цех"],
    objectType: "production",
  },
];
