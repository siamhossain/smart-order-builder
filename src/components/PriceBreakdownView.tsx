import type { MenuData } from "../types/menu";
import type { PriceBreakdown } from "../types/pricing";
import { formatBDT } from "../engine/money";
import { promotionLabel } from "./format";

interface Props {
  breakdown: PriceBreakdown;
  menu: MenuData;
  showLines?: boolean;
}

// Full breakdown: each line, subtotal, the cart discount, VAT and payable.
export function PriceBreakdownView({ breakdown, menu, showLines = true }: Props) {
  return (
    <table className="breakdown">
      <tbody>
        {showLines &&
          breakdown.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {breakdown.lines.length > 1 ? `Item ${index + 1}: ` : "Unit: "}
                {formatBDT(line.unitBase)}
                {line.unitDiscounts.map((d) => (
                  <span key={d.promotionId} className="muted">
                    {" "}
                    − {promotionLabel(d.promotionId, menu)} {formatBDT(d.amount)}
                  </span>
                ))}
                {" = "}
                {formatBDT(line.unitPrice)} × {line.qty}
              </td>
              <td className="num">{formatBDT(line.lineTotal)}</td>
            </tr>
          ))}
        <tr>
          <td>Subtotal</td>
          <td className="num">{formatBDT(breakdown.subtotal)}</td>
        </tr>
        {breakdown.cartDiscount && (
          <tr>
            <td>Discount {promotionLabel(breakdown.cartDiscount.promotionId, menu)}</td>
            <td className="num">− {formatBDT(breakdown.cartDiscount.amount)}</td>
          </tr>
        )}
        <tr>
          <td>VAT {menu.pricing.vatPercent}%</td>
          <td className="num">{formatBDT(breakdown.vat)}</td>
        </tr>
        <tr className="total">
          <td>Payable</td>
          <td className="num">৳ {formatBDT(breakdown.payable)}</td>
        </tr>
      </tbody>
    </table>
  );
}
