"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  useToast,
} from "@rentos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAttribution,
  useCreateCampaign,
  useCreatePromoCode,
  usePartnerPayable,
  usePartnerPayouts,
  usePlatformAdminPartner,
  usePlatformAdminPromoCodes,
  useRecordPayout,
  useRetryPromoCodeProvisioning,
  useUpdatePartnerStatus,
  type AffiliateCampaign,
  type AffiliateStatus,
} from "../../../../hooks/use-platform-admin";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatDate } from "../../../../lib/date-format";
import { formatMoney } from "../../../../lib/money";

/** Platform Admin -> Affiliates -> Partner detail (Stage 17 closure pass): campaigns, promo codes, referral attribution lookup, commission ledger, and manual payout recording. */
export default function PlatformAdminPartnerDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { data, isLoading } = usePlatformAdminPartner(partnerId);
  const updateStatus = useUpdatePartnerStatus(partnerId);
  const { toast } = useToast();
  const [currency, setCurrency] = useState("USD");

  if (isLoading || !data) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const { partner, campaigns, analytics } = data;
  const currencies = Object.keys(data.balances).length > 0 ? Object.keys(data.balances) : ["USD"];

  async function handleStatusChange(status: AffiliateStatus): Promise<void> {
    try {
      await updateStatus.mutateAsync(status);
      toast({ description: t("platformAdmin.affiliates.statusUpdated"), variant: "success" });
    } catch (err) {
      toast({ description: apiErrorMessage(err, t("common.error")), variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/platform-admin/affiliates" className="text-muted-foreground text-sm hover:underline">
          &larr; {t("platformAdmin.affiliates.backToList")}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{partner.displayName}</h1>
            <p className="text-muted-foreground text-sm">{partner.email}</p>
          </div>
          <div className="flex gap-2">
            {partner.status !== "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => void handleStatusChange("ACTIVE")}>
                {t("platformAdmin.affiliates.activatePartner")}
              </Button>
            )}
            {partner.status === "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => void handleStatusChange("PAUSED")}>
                {t("platformAdmin.affiliates.pausePartner")}
              </Button>
            )}
            {partner.status !== "ENDED" && (
              <Button size="sm" variant="outline" onClick={() => void handleStatusChange("ENDED")}>
                {t("platformAdmin.affiliates.endPartner")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("platformAdmin.affiliates.metrics.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Metric label={t("platformAdmin.affiliates.metrics.registrations")} value={analytics.registrations} />
          <Metric label={t("platformAdmin.affiliates.metrics.trialsStarted")} value={analytics.trialsStarted} />
          <Metric label={t("platformAdmin.affiliates.metrics.paidConversions")} value={analytics.paidConversions} />
          <Metric
            label={t("platformAdmin.affiliates.metrics.activeSubscribers")}
            value={analytics.activeSubscribers}
          />
          <Metric label={t("platformAdmin.affiliates.metrics.cancellations")} value={analytics.cancellations} />
        </CardContent>
      </Card>

      <CampaignsCard partnerId={partnerId} campaigns={campaigns} />

      <AttributionLookupCard partnerId={partnerId} partnerName={partner.displayName} />

      <Card>
        <CardHeader>
          <CardTitle>{t("platformAdmin.affiliates.ledger.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 max-w-[10rem]">
            <Label htmlFor="ledgerCurrency">{t("platformAdmin.affiliates.payouts.form.currency")}</Label>
            <Select id="ledgerCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          {/* Never a combined cross-currency total — every figure below is scoped to the one selected currency (see docs/DECISIONS.md). */}
          <LedgerSummary partnerId={partnerId} currency={currency} locale={i18n.language} />
        </CardContent>
      </Card>

      <PayoutsCard partnerId={partnerId} currency={currency} locale={i18n.language} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function LedgerSummary({ partnerId, currency, locale }: { partnerId: string; currency: string; locale: string }) {
  const { t } = useTranslation();
  const { data: payable, isLoading } = usePartnerPayable(partnerId, currency);

  if (isLoading || !payable) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const hasActivity =
    payable.earnedMinor !== 0 || payable.adjustmentsMinor !== 0 || payable.paidMinor !== 0;

  if (!hasActivity) {
    return <p className="text-muted-foreground text-sm">{t("platformAdmin.affiliates.ledger.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <div className="text-lg font-semibold">{formatMoney(payable.earnedMinor, currency, locale)}</div>
        <div className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.ledger.earned")}</div>
      </div>
      <div>
        <div className="text-lg font-semibold">{formatMoney(payable.adjustmentsMinor, currency, locale)}</div>
        <div className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.ledger.adjustments")}</div>
      </div>
      <div>
        <div className="text-lg font-semibold">{formatMoney(payable.paidMinor, currency, locale)}</div>
        <div className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.ledger.paid")}</div>
      </div>
      <div>
        <div className="text-lg font-semibold">{formatMoney(payable.payableMinor, currency, locale)}</div>
        <div className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.ledger.payable")}</div>
      </div>
    </div>
  );
}

function CampaignsCard({ partnerId, campaigns }: { partnerId: string; campaigns: AffiliateCampaign[] }) {
  const { t } = useTranslation();
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("platformAdmin.affiliates.campaigns.title")}</CardTitle>
        <Button size="sm" onClick={() => setCreateCampaignOpen(true)}>
          {t("platformAdmin.affiliates.campaigns.createCampaign")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {campaigns.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("platformAdmin.affiliates.campaigns.empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.campaigns.columns.name")}</th>
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.campaigns.columns.slug")}</th>
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.campaigns.columns.rate")}</th>
                <th className="py-2 pr-4 font-medium">
                  {t("platformAdmin.affiliates.campaigns.columns.duration")}
                </th>
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.campaigns.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className={`cursor-pointer border-b last:border-0 hover:bg-accent/50 ${selectedCampaignId === campaign.id ? "bg-accent/50" : ""}`}
                  onClick={() => setSelectedCampaignId(campaign.id === selectedCampaignId ? null : campaign.id)}
                >
                  <td className="py-2 pr-4 font-medium">{campaign.name}</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs">{campaign.slug}</code>
                  </td>
                  <td className="py-2 pr-4">{(campaign.commissionRateBp / 100).toFixed(1)}%</td>
                  <td className="py-2 pr-4">{campaign.commissionDurationMonths}mo</td>
                  <td className="py-2 pr-4">{t(`platformAdmin.affiliates.status.${campaign.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selectedCampaignId && <PromoCodesCard campaignId={selectedCampaignId} />}
      </CardContent>

      <CreateCampaignDialog
        partnerId={partnerId}
        open={createCampaignOpen}
        onOpenChange={setCreateCampaignOpen}
      />
    </Card>
  );
}

function CreateCampaignDialog({
  partnerId,
  open,
  onOpenChange,
}: {
  partnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createCampaign = useCreateCampaign(partnerId);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [rate, setRate] = useState("25");
  const [duration, setDuration] = useState("12");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setSlug("");
      setRate("25");
      setDuration("12");
      setError(null);
    }
  }

  async function handleCreate(): Promise<void> {
    setError(null);
    try {
      await createCampaign.mutateAsync({
        name,
        slug,
        commissionRateBp: Math.round(Number(rate) * 100),
        commissionDurationMonths: Number(duration),
      });
      toast({ description: t("platformAdmin.affiliates.campaigns.created"), variant: "success" });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platformAdmin.affiliates.campaigns.createCampaign")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaignName">{t("platformAdmin.affiliates.campaigns.form.name")}</Label>
            <Input id="campaignName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaignSlug">{t("platformAdmin.affiliates.campaigns.form.slug")}</Label>
            <Input
              id="campaignSlug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="rentalpro"
            />
            <p className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.campaigns.form.slugHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaignRate">{t("platformAdmin.affiliates.campaigns.form.commissionRate")}</Label>
              <Input id="campaignRate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaignDuration">
                {t("platformAdmin.affiliates.campaigns.form.commissionDuration")}
              </Label>
              <Input
                id="campaignDuration"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || !slug.trim() || createCampaign.isPending}
          >
            {createCampaign.isPending ? t("common.saving") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoCodesCard({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: promoCodes, isLoading } = usePlatformAdminPromoCodes(campaignId);
  const retryProvisioning = useRetryPromoCodeProvisioning(campaignId);
  const [createOpen, setCreateOpen] = useState(false);

  async function handleRetry(promoCodeId: string): Promise<void> {
    try {
      const result = await retryProvisioning.mutateAsync(promoCodeId);
      toast({
        description:
          result.provisioningStatus === "PROVISIONED"
            ? t("platformAdmin.affiliates.promoCodes.provisioningRetrySucceeded")
            : t("platformAdmin.affiliates.promoCodes.provisioningRetryStillFailing"),
        variant: result.provisioningStatus === "PROVISIONED" ? "success" : "destructive",
      });
    } catch (error) {
      toast({ description: apiErrorMessage(error, t("common.error")), variant: "destructive" });
    }
  }

  return (
    <div className="border-t pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("platformAdmin.affiliates.promoCodes.title")}</h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          {t("platformAdmin.affiliates.promoCodes.createCode")}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : !promoCodes || promoCodes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("platformAdmin.affiliates.promoCodes.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.promoCodes.columns.code")}</th>
              <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.promoCodes.columns.discount")}</th>
              <th className="py-2 pr-4 font-medium">
                {t("platformAdmin.affiliates.promoCodes.columns.redemptions")}
              </th>
              <th className="py-2 pr-4 font-medium">
                {t("platformAdmin.affiliates.promoCodes.columns.stripeLinked")}
              </th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {promoCodes.map((code) => (
              <tr key={code.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <code>{code.code}</code>
                </td>
                <td className="py-2 pr-4">
                  {code.discountType === "PERCENTAGE"
                    ? `${(code.discountValueBp ?? 0) / 100}%`
                    : formatMoney(code.discountValueMinor, code.currency)}
                </td>
                <td className="py-2 pr-4">
                  {code.redemptionCount}
                  {code.maxRedemptions ? `/${code.maxRedemptions}` : ""}
                </td>
                <td className="py-2 pr-4">
                  {code.provisioningStatus === "PROVISIONED" ? (
                    t("platformAdmin.affiliates.promoCodes.stripeLinked")
                  ) : code.provisioningStatus === "FAILED" ? (
                    <span className="text-destructive" title={code.provisioningError ?? undefined}>
                      {t("platformAdmin.affiliates.promoCodes.provisioningFailed")}
                    </span>
                  ) : (
                    t("platformAdmin.affiliates.promoCodes.stripeNotLinked")
                  )}
                </td>
                <td className="py-2 pr-4">
                  {code.provisioningStatus === "FAILED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retryProvisioning.isPending}
                      onClick={() => void handleRetry(code.id)}
                    >
                      {t("platformAdmin.affiliates.promoCodes.retryProvisioning")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CreatePromoCodeDialog campaignId={campaignId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreatePromoCodeDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createPromoCode = useCreatePromoCode();
  const [code, setCode] = useState("");
  const [discountValueBp, setDiscountValueBp] = useState("20");
  const [duration, setDuration] = useState<"ONCE" | "REPEATING" | "FOREVER">("REPEATING");
  const [durationInMonths, setDurationInMonths] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCode("");
      setDiscountValueBp("20");
      setDuration("REPEATING");
      setDurationInMonths("3");
      setError(null);
    }
  }

  async function handleCreate(): Promise<void> {
    setError(null);
    try {
      await createPromoCode.mutateAsync({
        code,
        discountType: "PERCENTAGE",
        discountValueBp: Math.round(Number(discountValueBp) * 100),
        duration,
        ...(duration === "REPEATING" ? { durationInMonths: Number(durationInMonths) } : {}),
        affiliateCampaignId: campaignId,
      });
      toast({ description: t("platformAdmin.affiliates.promoCodes.created"), variant: "success" });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platformAdmin.affiliates.promoCodes.createCode")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promoCodeInput">{t("platformAdmin.affiliates.promoCodes.form.code")}</Label>
            <Input id="promoCodeInput" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promoDiscountBp">{t("platformAdmin.affiliates.promoCodes.form.discountValueBp")}</Label>
            <Input
              id="promoDiscountBp"
              type="number"
              value={discountValueBp}
              onChange={(e) => setDiscountValueBp(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promoDuration">{t("platformAdmin.affiliates.promoCodes.form.duration")}</Label>
            <Select
              id="promoDuration"
              value={duration}
              onChange={(e) => setDuration(e.target.value as "ONCE" | "REPEATING" | "FOREVER")}
            >
              <option value="ONCE">{t("platformAdmin.affiliates.promoCodes.form.once")}</option>
              <option value="REPEATING">{t("platformAdmin.affiliates.promoCodes.form.repeating")}</option>
              <option value="FOREVER">{t("platformAdmin.affiliates.promoCodes.form.forever")}</option>
            </Select>
          </div>
          {duration === "REPEATING" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promoDurationMonths">
                {t("platformAdmin.affiliates.promoCodes.form.durationInMonths")}
              </Label>
              <Input
                id="promoDurationMonths"
                type="number"
                value={durationInMonths}
                onChange={(e) => setDurationInMonths(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!code.trim() || createPromoCode.isPending}>
            {createPromoCode.isPending ? t("common.saving") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttributionLookupCard({ partnerId, partnerName }: { partnerId: string; partnerName: string }) {
  const { t, i18n } = useTranslation();
  const [tenantId, setTenantId] = useState("");
  const [searchedTenantId, setSearchedTenantId] = useState<string | null>(null);
  const { data: attribution, isFetched } = useAttribution(searchedTenantId ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("platformAdmin.affiliates.attribution.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder={t("platformAdmin.affiliates.attribution.tenantIdLabel")}
            className="max-w-md"
          />
          <Button variant="outline" onClick={() => setSearchedTenantId(tenantId.trim())} disabled={!tenantId.trim()}>
            {t("platformAdmin.affiliates.attribution.search")}
          </Button>
        </div>

        {isFetched && searchedTenantId && (
          <>
            {!attribution ? (
              <p className="text-muted-foreground text-sm">{t("platformAdmin.affiliates.attribution.notFound")}</p>
            ) : attribution.partnerId !== partnerId ? (
              <Alert variant="warning">
                <AlertDescription>
                  {t("platformAdmin.affiliates.attribution.notFound")} ({partnerName})
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.attribution.source")}</div>
                  <div>{attribution.source}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    {t("platformAdmin.affiliates.attribution.attributedAt")}
                  </div>
                  <div>{formatDate(attribution.attributedAt, i18n.language)}</div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PayoutsCard({ partnerId, currency, locale }: { partnerId: string; currency: string; locale: string }) {
  const { t } = useTranslation();
  const { data: payouts, isLoading } = usePartnerPayouts(partnerId);
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("platformAdmin.affiliates.payouts.title")}</CardTitle>
        <Button size="sm" onClick={() => setRecordOpen(true)}>
          {t("platformAdmin.affiliates.payouts.recordPayout")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">{t("platformAdmin.affiliates.payouts.disclaimer")}</p>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : !payouts || payouts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("platformAdmin.affiliates.payouts.empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.payouts.columns.date")}</th>
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.payouts.columns.amount")}</th>
                <th className="py-2 pr-4 font-medium">{t("platformAdmin.affiliates.payouts.columns.method")}</th>
                <th className="py-2 pr-4 font-medium">
                  {t("platformAdmin.affiliates.payouts.columns.reference")}
                </th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{formatDate(payout.payoutDate, locale)}</td>
                  <td className="py-2 pr-4">{formatMoney(payout.amountMinor, payout.currency, locale)}</td>
                  <td className="py-2 pr-4">{payout.method}</td>
                  <td className="py-2 pr-4">{payout.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <RecordPayoutDialog partnerId={partnerId} defaultCurrency={currency} open={recordOpen} onOpenChange={setRecordOpen} />
    </Card>
  );
}

function RecordPayoutDialog({
  partnerId,
  defaultCurrency,
  open,
  onOpenChange,
}: {
  partnerId: string;
  defaultCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const recordPayout = useRecordPayout(partnerId);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"BANK_TRANSFER" | "PAYPAL" | "OTHER">("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount("");
      setCurrency(defaultCurrency);
      setDate(new Date().toISOString().slice(0, 10));
      setMethod("BANK_TRANSFER");
      setReference("");
      setNote("");
      setError(null);
    }
  }

  async function handleRecord(): Promise<void> {
    setError(null);
    const amountMinor = Math.round(Number(amount) * 100);
    if (!amountMinor || amountMinor <= 0) {
      setError(t("payment.invalidAmount"));
      return;
    }
    try {
      await recordPayout.mutateAsync({
        amountMinor,
        currency,
        payoutDate: new Date(date).toISOString(),
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast({ description: t("platformAdmin.affiliates.payouts.recorded"), variant: "success", duration: 8000 });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platformAdmin.affiliates.payouts.recordPayout")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Alert variant="info">
            <AlertDescription>{t("platformAdmin.affiliates.payouts.disclaimer")}</AlertDescription>
          </Alert>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoutAmount">{t("platformAdmin.affiliates.payouts.form.amount")}</Label>
              <Input id="payoutAmount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payoutCurrency">{t("platformAdmin.affiliates.payouts.form.currency")}</Label>
              <Input id="payoutCurrency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payoutDate">{t("platformAdmin.affiliates.payouts.form.date")}</Label>
            <Input id="payoutDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payoutMethod">{t("platformAdmin.affiliates.payouts.form.method")}</Label>
            <Select id="payoutMethod" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="BANK_TRANSFER">{t("platformAdmin.affiliates.payouts.form.bankTransfer")}</option>
              <option value="PAYPAL">{t("platformAdmin.affiliates.payouts.form.paypal")}</option>
              <option value="OTHER">{t("platformAdmin.affiliates.payouts.form.other")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payoutReference">{t("platformAdmin.affiliates.payouts.form.reference")}</Label>
            <Input id="payoutReference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payoutNote">{t("platformAdmin.affiliates.payouts.form.note")}</Label>
            <Input id="payoutNote" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleRecord()} disabled={recordPayout.isPending}>
            {recordPayout.isPending ? t("common.saving") : t("platformAdmin.affiliates.payouts.recordPayout")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
