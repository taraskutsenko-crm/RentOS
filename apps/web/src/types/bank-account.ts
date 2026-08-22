export interface CompanyBankAccount {
  id: string;
  tenantId: string;
  label: string;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftBic: string | null;
  currency: string;
  bankAddress: string | null;
  paymentReference: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
