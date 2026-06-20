import { Trash2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export const emptyLine = (): LineItem => ({ description: "", quantity: 1, unitPrice: 0, taxRate: 0 });

export function lineTotal(i: LineItem) {
  const net = i.quantity * i.unitPrice;
  return net + (net * i.taxRate) / 100;
}

export function LineItemsEditor({ items, onChange, currency = "USD" }: { items: LineItem[]; onChange: (items: LineItem[]) => void; currency?: string }) {
  const update = (idx: number, patch: Partial<LineItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const grand = items.reduce((s, i) => s + lineTotal(i), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_80px_110px_80px_110px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground">
        <span>Description</span><span>Qty</span><span>Unit price</span><span>Tax %</span><span className="text-right">Total</span><span />
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_80px_110px_80px_110px_36px] items-center gap-2">
          <Input placeholder="Item description" value={item.description} onChange={(e) => update(idx, { description: e.target.value })} />
          <Input type="number" min={0} value={item.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) })} />
          <Input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })} />
          <Input type="number" min={0} max={100} value={item.taxRate} onChange={(e) => update(idx, { taxRate: Number(e.target.value) })} />
          <span className="text-right text-sm tabular-nums">{formatCurrency(lineTotal(item), currency)}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyLine()])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <div className="text-sm font-semibold">Total: {formatCurrency(grand, currency)}</div>
      </div>
    </div>
  );
}
