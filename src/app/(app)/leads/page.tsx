import { redirect } from "next/navigation";

/** La bacheca lead è stata unita alle Vendite: i vecchi link continuano a funzionare. */
export default function LeadsPage() {
  redirect("/sales");
}
