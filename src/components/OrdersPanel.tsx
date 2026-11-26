import { useState } from "react";
import type { StoredOrder } from "../types/order";
import type { MenuData } from "../types/menu";
import { formatBDT } from "../engine/money";
import { api, errorMessage } from "../api/client";
import { describeConfig } from "./format";

interface Props {
  orders: StoredOrder[];
  menu: MenuData;
}

// "2026-11-20 09:15" in Dhaka time, whatever the browser's time zone is.
function formatDhaka(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Dhaka",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Save a text file in the browser.
function downloadFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function OrdersPanel({ orders, menu }: Props) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Ask the server for the file, so it is exactly what the server stores.
  async function download() {
    setDownloadError(null);
    try {
      const file = await api.getOrders();
      downloadFile("orders.json", JSON.stringify(file, null, 2));
    } catch (error) {
      setDownloadError(errorMessage(error));
    }
  }

  const total = orders.reduce((sum, o) => sum + o.totals.payable, 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Orders ({orders.length})</h2>
        <button type="button" onClick={download}>
          Download orders.json
        </button>
      </div>
      {downloadError && <p className="notice error">{downloadError}</p>}

      <div className="table-scroll">
        <table className="orders">
          <thead>
            <tr>
              <th>Order</th>
              <th>Time (Dhaka)</th>
              <th>Payment</th>
              <th>Coupon</th>
              <th className="num">Payable</th>
            </tr>
          </thead>
          <tbody>
            {[...orders].reverse().map((order) => (
              <tr key={order.id}>
                <td title={order.lines.map((l) => `${l.qty} × ${describeConfig(l.options, menu)}`).join("\n")}>
                  {order.id}
                  {order.source === "seed" && <span className="muted small"> (seed)</span>}
                </td>
                <td>{formatDhaka(order.createdAt)}</td>
                <td>{order.paymentMethod}</td>
                <td>{order.coupon ? `${order.coupon.code}: ${order.coupon.status}` : "—"}</td>
                <td className="num">{formatBDT(order.totals.payable)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total revenue</td>
              <td className="num">{formatBDT(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
