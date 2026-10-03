// Fixture A: invoice helper with a distinctive token (zephyr).
export function zephyrInvoiceTotals(lines: Array<{ qty: number; price: number }>): number {
  return lines.reduce((sum, l) => sum + l.qty * l.price, 0);
}
