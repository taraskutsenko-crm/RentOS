"use client";

import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/shell/page-header";
import { useCreatePartner, usePlatformAdminPartners } from "../../../hooks/use-platform-admin";
import { apiErrorMessage } from "../../../lib/api-error-i18n";

/** Platform Admin -> Affiliates: the partner list + create-partner entry point (Stage 17 closure pass). */
export default function PlatformAdminAffiliatesPage() {
  const { t } = useTranslation();
  const { data: partners, isLoading } = usePlatformAdminPartners();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("platformAdmin.affiliates.title")}
        subtitle={t("platformAdmin.affiliates.subtitle")}
        primaryAction={
          <Button onClick={() => setCreateOpen(true)}>{t("platformAdmin.affiliates.createPartner")}</Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-muted-foreground p-6 text-sm">{t("common.loading")}</p>
          ) : !partners || partners.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">{t("platformAdmin.affiliates.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("platformAdmin.affiliates.columns.name")}</th>
                  <th className="px-4 py-2 font-medium">{t("platformAdmin.affiliates.columns.email")}</th>
                  <th className="px-4 py-2 font-medium">{t("platformAdmin.affiliates.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => (
                  <tr key={partner.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2">
                      <Link href={`/platform-admin/affiliates/${partner.id}`} className="font-medium underline-offset-2 hover:underline">
                        {partner.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{partner.email}</td>
                    <td className="px-4 py-2">{t(`platformAdmin.affiliates.status.${partner.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreatePartnerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreatePartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createPartner = useCreatePartner();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDisplayName("");
      setEmail("");
      setError(null);
    }
  }

  async function handleCreate(): Promise<void> {
    setError(null);
    try {
      await createPartner.mutateAsync({ displayName, email });
      toast({ description: t("platformAdmin.affiliates.partnerCreated"), variant: "success" });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platformAdmin.affiliates.createPartner")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partnerName">{t("platformAdmin.affiliates.form.displayName")}</Label>
            <Input id="partnerName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partnerEmail">{t("platformAdmin.affiliates.form.email")}</Label>
            <Input id="partnerEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!displayName.trim() || !email.trim() || createPartner.isPending}
          >
            {createPartner.isPending ? t("common.saving") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
