/**
 * Static section labels for the Financial Report PDF export — a small,
 * hand-authored dictionary, mirroring the exact pattern
 * payment-demand-strings.ts already established for a bounded set of
 * languages (EN always available, plus the languages this codebase's other
 * hand-authored PDF content already covers) rather than routing through
 * the full 14-locale UI translation system, which is out of scope for a
 * V1 export. Falls back to English for any language not listed here — a
 * documented, disclosed limitation (see docs/DECISIONS.md), never a raw
 * missing-key string.
 */
export interface FinanceReportStrings {
  title: string;
  period: string;
  generatedAt: string;
  summary: string;
  invoiced: string;
  cashReceived: string;
  outstanding: string;
  overdue: string;
  tax: string;
  collectionRate: string;
  receivableAging: string;
  notDue: string;
  topCustomers: string;
  customer: string;
  amount: string;
  deposits: string;
  depositsReceived: string;
  depositsReturned: string;
  depositsRetained: string;
  depositsApplied: string;
  depositsHeld: string;
  noData: string;
}

const EN_STRINGS: FinanceReportStrings = {
  title: "Financial Report",
  period: "Period",
  generatedAt: "Generated",
  summary: "Summary",
  invoiced: "Invoiced",
  cashReceived: "Cash received",
  outstanding: "Outstanding",
  overdue: "Overdue",
  tax: "Tax",
  collectionRate: "Collection rate",
  receivableAging: "Receivable aging",
  notDue: "Not due",
  topCustomers: "Top customers",
  customer: "Customer",
  amount: "Amount",
  deposits: "Deposits (not revenue)",
  depositsReceived: "Received",
  depositsReturned: "Returned",
  depositsRetained: "Retained",
  depositsApplied: "Applied to receivables",
  depositsHeld: "Currently held",
  noData: "No data for this period",
};

const RU_STRINGS: FinanceReportStrings = {
  title: "Финансовый отчёт",
  period: "Период",
  generatedAt: "Сформирован",
  summary: "Сводка",
  invoiced: "Выставлено",
  cashReceived: "Получено оплат",
  outstanding: "Задолженность",
  overdue: "Просрочено",
  tax: "Налог",
  collectionRate: "Собираемость",
  receivableAging: "Возраст задолженности",
  notDue: "Не просрочено",
  topCustomers: "Крупнейшие клиенты",
  customer: "Клиент",
  amount: "Сумма",
  deposits: "Депозиты (не выручка)",
  depositsReceived: "Получено",
  depositsReturned: "Возвращено",
  depositsRetained: "Удержано",
  depositsApplied: "Зачтено в оплату",
  depositsHeld: "Удерживается сейчас",
  noData: "Нет данных за этот период",
};

const PL_STRINGS: FinanceReportStrings = {
  title: "Raport finansowy",
  period: "Okres",
  generatedAt: "Wygenerowano",
  summary: "Podsumowanie",
  invoiced: "Zafakturowano",
  cashReceived: "Otrzymane wpłaty",
  outstanding: "Należności",
  overdue: "Przeterminowane",
  tax: "Podatek",
  collectionRate: "Wskaźnik spłacalności",
  receivableAging: "Wiekowanie należności",
  notDue: "Nieprzeterminowane",
  topCustomers: "Najwięksi klienci",
  customer: "Klient",
  amount: "Kwota",
  deposits: "Kaucje (nie są przychodem)",
  depositsReceived: "Przyjęto",
  depositsReturned: "Zwrócono",
  depositsRetained: "Zatrzymano",
  depositsApplied: "Zaliczono na poczet należności",
  depositsHeld: "Obecnie zatrzymane",
  noData: "Brak danych za ten okres",
};

const STRINGS_BY_LANGUAGE: Record<string, FinanceReportStrings> = {
  en: EN_STRINGS,
  ru: RU_STRINGS,
  pl: PL_STRINGS,
};

export function getFinanceReportStrings(language: string): FinanceReportStrings {
  return STRINGS_BY_LANGUAGE[language.toLowerCase()] ?? EN_STRINGS;
}
