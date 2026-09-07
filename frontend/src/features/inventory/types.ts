export type ItemType = "fixed_asset" | "consumable";
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export interface InventoryCategory {
  id: string;
  reference: string;
  company: string;
  company_name: string;
  name: string;
  item_type: ItemType | "";
  description: string;
  is_archived: boolean;
}
export interface InventoryItem {
  id: string;
  reference: string;
  company: string;
  company_name: string;
  category: string | null;
  category_name: string;
  item_type: ItemType;
  name: string;
  sku: string;
  asset_tag: string;
  description: string;
  quantity: string;
  unit: string;
  purchase_date: string | null;
  unit_cost: string | null;
  total_cost: string | null;
  currency: string;
  supplier: string | null;
  supplier_name: string;
  financial_record: string | null;
  serial_number: string;
  condition: string;
  status: string;
  location: string;
  responsible_person: string | null;
  responsible_person_name: string;
  minimum_stock: string | null;
  needs_reorder: boolean;
  warranty_expiration: string | null;
  useful_life_years: number | null;
  notes: string;
  image: string | null;
  image_url: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface InventoryMovement {
  id: string;
  reference: string;
  item: string;
  item_reference: string;
  item_name: string;
  movement_type: string;
  quantity: string;
  quantity_before: string;
  quantity_after: string;
  unit_cost: string | null;
  occurred_on: string;
  from_location: string;
  to_location: string;
  reason: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}
