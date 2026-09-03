"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  useToast,
} from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../../../components/data-table/confirm-dialog";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import {
  useBillingSubscription,
  useCancelSubscription,
  useChangePlan,
  useCreateBillingPortalSession,
  useCreateCheckoutSession,
  usePlans,
  usePreviewPromoCode,
  useResumeSubscription,
  type BillingInterval,
  type HavelioPlan,
} from "../../../../hooks/use-billing";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatDate } from "../../../../lib/date-format";
import { formatMoney } from "../../../../lib/money";

const PLAN_RANK: Record<HavelioPlan, number> = { STARTER: 1, BUSINESS: 2, PROFESSIONAL: 3, ENTERPRISE: 4 };

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * Settings -> Billing (Stage 17): Havelio's OWN subscription — plan, trial,
 * status, price, next billing date, cancellation state, and self-service
 * plan/interval selection. Never confuse with the tenant's RENTAL FINANCE
 * (Invoices/Payments) — that stays entirely separate, see
 * docs/DECISIONS.md.
 */
export default function BillingSettingsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("billing.manage");

  const { data, isLoading } = useBillingSubscription(tenantId);
  const { data: plansData } = usePlans();

  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [promoCode, setPromoCode] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<HavelioPlan | null>(null);

  const createCheckout = useCreateCheckoutSession(tenantId);
  const createPortal = useCreateBillingPortalSession(tenantId);
  const cancelSubscription = useCancelSubscription(tenantId);
  const resumeSubscription = useResumeSubscription(tenantId);
  const changePlan = useChangePlan(tenantId);

  if (isLoading || !data || !plansData) {
    return <div className="text-muted-foreground text-sm">{t("common.loading")}</div>;
  }

  const { subscription, plan, usage, stripeConfigured } = data;
  const locale = i18n.language;
  const hasActiveSubscription =
    subscription.status === "ACTIVE" || subscription.status === "PAST_DUE";

  async function handleSubscribe(selectedPlan: HavelioPlan): Promise<void> {
    if (selectedPlan === "ENTERPRISE") return;
    try {
      if (hasActiveSubscription) {
        await changePlan.mutateAsync({ plan: selectedPlan, interval });
        toast({
          description:
            PLAN_RANK[selectedPlan] > PLAN_RANK[subscription.plan]
              ? t("billing.toast.upgraded")
              : t("billing.toast.downgradeScheduled"),
          variant: "success",
        });
      } else {
        const result = await createCheckout.mutateAsync({
          plan: selectedPlan,
          interval,
          ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        });
        window.location.href = result.url;
      }
    } catch (error) {
      toast({ description: apiErrorMessage(error, t("common.error")), variant: "destructive" });
    } finally {
      setPendingPlan(null);
    }
  }

  async function handleManageBilling(): Promise<void> {
    try {
      const result = await createPortal.mutateAsync();
      window.location.href = result.url;
    } catch (error) {
      toast({ description: apiErrorMessage(error, t("common.error")), variant: "destructive" });
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelSubscription.mutateAsync();
      toast({ description: t("billing.toast.canceled"), variant: "success" });
    } catch (error) {
      toast({ description: apiErrorMessage(error, t("common.error")), variant: "destructive" });
    } finally {
      setCancelDialogOpen(false);
    }
  }

  async function handleResume(): Promise<void> {
    try {
      await resumeSubscription.mutateAsync();
      toast({ description: t("billing.toast.resumed"), variant: "success" });
    } catch (error) {
      toast({ description: apiErrorMessage(error, t("common.error")), variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("billing.settings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("billing.settings.subtitle")}</p>
      </div>

      {!stripeConfigured && (
        <Alert variant="info">
          <AlertDescription>{t("billing.stripeNotConfigured")}</AlertDescription>
        </Alert>
      )}

      <TrialBanner subscription={subscription} locale={locale} />

      <CurrentPlanCard
        subscription={subscription}
        plan={plan}
        usage={usage}
        locale={locale}
        canManage={canManage}
        stripeConfigured={stripeConfigured}
        onManageBilling={() => void handleManageBilling()}
        onCancel={() => setCancelDialogOpen(true)}
        onResume={() => void handleResume()}
        isManaging={createPortal.isPending}
        isResuming={resumeSubscription.isPending}
      />

      {canManage && (
        <PlanChooser
          plans={plansData.plans}
          currentPlan={subscription.plan}
          currentStatus={subscription.status}
          interval={interval}
          onIntervalChange={setInterval}
          promoCode={promoCode}
          onPromoCodeChange={setPromoCode}
          tenantId={tenantId}
          onSubscribe={(selectedPlan) => {
            setPendingPlan(selectedPlan);
            void handleSubscribe(selectedPlan);
          }}
          pendingPlan={pendingPlan}
          stripeConfigured={stripeConfigured}
          hasActiveSubscription={hasActiveSubscription}
        />
      )}

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title={t("billing.cancelDialog.title")}
        description={t("billing.cancelDialog.description", {
          date: subscription.currentPeriodEnd
            ? formatDate(subscription.currentPeriodEnd, locale)
            : "—",
        })}
        confirmLabel={t("billing.cancelDialog.confirm")}
        destructive
        isLoading={cancelSubscription.isPending}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}

function TrialBanner({
  subscription,
  locale,
}: {
  subscription: NonNullable<ReturnType<typeof useBillingSubscription>["data"]>["subscription"];
  locale: string;
}) {
  const { t } = useTranslation();

  if (subscription.status === "TRIALING") {
    const days = daysUntil(subscription.trialEndsAt);
    return (
      <Alert variant={days <= 3 ? "warning" : "info"}>
        <AlertDescription>
          {days > 0
            ? t("billing.trial.daysLeft", { count: days })
            : t("billing.trial.endsToday")}
        </AlertDescription>
      </Alert>
    );
  }

  if (subscription.status === "EXPIRED") {
    return (
      <Alert variant="warning">
        <AlertDescription>{t("billing.trial.ended")}</AlertDescription>
      </Alert>
    );
  }

  if (subscription.status === "PAST_DUE") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("billing.pastDue")}</AlertDescription>
      </Alert>
    );
  }

  if (subscription.status === "CANCELED") {
    return (
      <Alert variant="warning">
        <AlertDescription>{t("billing.canceled")}</AlertDescription>
      </Alert>
    );
  }

  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {t("billing.cancelsOn", { date: formatDate(subscription.currentPeriodEnd, locale) })}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

function UsageRow({
  label,
  current,
  limit,
  restricted,
}: {
  label: string;
  current: number;
  limit: number | null;
  /** True while access is RESTRICTED (expired trial/canceled/etc.) — a null `limit` in that state means "no plan to measure against," never "unlimited." See docs/DECISIONS.md. */
  restricted?: boolean;
}) {
  const { t } = useTranslation();
  if (restricted) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span>{t("billing.usage.currentCount", { count: current })}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={limit !== null && current >= limit ? "text-warning font-medium" : ""}>
        {limit === null ? t("billing.usage.unlimited", { current }) : `${current}/${limit}`}
      </span>
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  plan,
  usage,
  locale,
  canManage,
  stripeConfigured,
  onManageBilling,
  onCancel,
  onResume,
  isManaging,
  isResuming,
}: {
  subscription: NonNullable<ReturnType<typeof useBillingSubscription>["data"]>["subscription"];
  plan: NonNullable<ReturnType<typeof useBillingSubscription>["data"]>["plan"];
  usage: { assets: number; users: number };
  locale: string;
  canManage: boolean;
  stripeConfigured: boolean;
  onManageBilling: () => void;
  onCancel: () => void;
  onResume: () => void;
  isManaging: boolean;
  isResuming: boolean;
}) {
  const { t } = useTranslation();
  const priceMinor =
    subscription.billingInterval === "ANNUAL" ? plan?.annualPriceMinor : plan?.monthlyPriceMinor;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("billing.currentPlan.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-semibold">
            {plan ? plan.name : t(`billing.plans.${subscription.plan}`)}
          </span>
          <span className="text-muted-foreground text-sm">
            {t(`billing.status.${subscription.status}`)}
            {subscription.isGrandfathered ? ` · ${t("billing.grandfathered")}` : ""}
          </span>
        </div>

        {priceMinor !== null && priceMinor !== undefined && subscription.billingInterval && (
          <p className="text-sm">
            {formatMoney(priceMinor, plan?.currency ?? "EUR", locale)}
            {" / "}
            {t(subscription.billingInterval === "ANNUAL" ? "billing.perYear" : "billing.perMonth")}
          </p>
        )}

        {subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
          <p className="text-muted-foreground text-sm">
            {t("billing.nextBillingDate", { date: formatDate(subscription.currentPeriodEnd, locale) })}
          </p>
        )}

        <div className="flex flex-col gap-1.5 border-t pt-3">
          <UsageRow
            label={t("billing.usage.assets")}
            current={usage.assets}
            limit={plan?.limits.maxActiveAssets ?? null}
            restricted={!plan}
          />
          <UsageRow
            label={t("billing.usage.users")}
            current={usage.users}
            limit={plan?.limits.maxUsers ?? null}
            restricted={!plan}
          />
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {subscription.stripeSubscriptionId && stripeConfigured && (
              <Button variant="outline" size="sm" onClick={onManageBilling} disabled={isManaging}>
                {t("billing.actions.manageBilling")}
              </Button>
            )}
            {(subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
              !subscription.cancelAtPeriodEnd && (
                <Button variant="outline" size="sm" onClick={onCancel}>
                  {t("billing.actions.cancel")}
                </Button>
              )}
            {subscription.cancelAtPeriodEnd && (
              <Button size="sm" onClick={onResume} disabled={isResuming}>
                {isResuming ? t("common.saving") : t("billing.actions.resume")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Live valid/invalid feedback for the promo-code field, checked against the
 * BUSINESS plan as a representative reference (a code ineligible only for
 * one specific other plan would still show as "valid" here — an acceptable
 * V1 simplification; each PlanCard's own price line is always authoritative
 * for that specific plan). See docs/DECISIONS.md "promo discount
 * transparency" — never leaves the field silently blank on an invalid code.
 */
function PromoCodeStatus({
  tenantId,
  promoCode,
  interval,
}: {
  tenantId: string | null;
  promoCode: string;
  interval: BillingInterval;
}) {
  const { t } = useTranslation();
  const { data, isError, error } = usePreviewPromoCode(tenantId, promoCode, "BUSINESS", interval);

  if (!promoCode.trim() || promoCode.trim().length < 3) return null;
  if (data) {
    return <p className="text-success text-xs">{t("billing.promoCode.valid")}</p>;
  }
  if (isError) {
    return <p className="text-destructive text-xs">{apiErrorMessage(error, t("billing.promoCode.invalid"))}</p>;
  }
  return null;
}

function PlanChooser({
  plans,
  currentPlan,
  currentStatus,
  interval,
  onIntervalChange,
  promoCode,
  onPromoCodeChange,
  tenantId,
  onSubscribe,
  pendingPlan,
  stripeConfigured,
  hasActiveSubscription,
}: {
  plans: NonNullable<ReturnType<typeof usePlans>["data"]>["plans"];
  currentPlan: HavelioPlan;
  currentStatus: string;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  promoCode: string;
  onPromoCodeChange: (code: string) => void;
  tenantId: string | null;
  onSubscribe: (plan: HavelioPlan) => void;
  pendingPlan: HavelioPlan | null;
  stripeConfigured: boolean;
  hasActiveSubscription: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const showsTrialUpsell = currentStatus === "TRIALING" || currentStatus === "EXPIRED";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(showsTrialUpsell ? "billing.chooseAPlan" : "billing.changePlan")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={interval === "MONTHLY" ? "default" : "outline"}
            onClick={() => onIntervalChange("MONTHLY")}
          >
            {t("billing.interval.monthly")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={interval === "ANNUAL" ? "default" : "outline"}
            onClick={() => onIntervalChange("ANNUAL")}
          >
            {t("billing.interval.annual")}
          </Button>
          <span className="text-muted-foreground text-xs">{t("billing.interval.annualDiscount")}</span>
        </div>

        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label htmlFor="promoCode">{t("billing.promoCode.label")}</Label>
          <Input
            id="promoCode"
            value={promoCode}
            onChange={(event) => onPromoCodeChange(event.target.value.toUpperCase())}
            placeholder={t("billing.promoCode.placeholder")}
          />
          <PromoCodeStatus tenantId={tenantId} promoCode={promoCode} interval={interval} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan}
              plan={plan}
              interval={interval}
              locale={locale}
              isCurrent={plan.plan === currentPlan && hasActiveSubscription}
              onSubscribe={() => onSubscribe(plan.plan)}
              isPending={pendingPlan === plan.plan}
              stripeConfigured={stripeConfigured}
              tenantId={tenantId}
              promoCode={promoCode}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  interval,
  locale,
  isCurrent,
  onSubscribe,
  isPending,
  stripeConfigured,
  tenantId,
  promoCode,
}: {
  plan: NonNullable<ReturnType<typeof usePlans>["data"]>["plans"][number];
  interval: BillingInterval;
  locale: string;
  isCurrent: boolean;
  onSubscribe: () => void;
  isPending: boolean;
  stripeConfigured: boolean;
  tenantId: string | null;
  promoCode: string;
}) {
  const { t } = useTranslation();
  const priceMinor = interval === "ANNUAL" ? plan.annualPriceMinor : plan.monthlyPriceMinor;
  const { data: discountPreview } = usePreviewPromoCode(tenantId, promoCode, plan.plan, interval);

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-4 ${plan.isMostPopular ? "border-primary" : ""}`}
    >
      {plan.isMostPopular && (
        <span className="text-primary w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium">
          {t("billing.mostPopular")}
        </span>
      )}
      <span className="font-semibold">{plan.name}</span>

      {plan.isContactSalesOnly ? (
        <span className="text-muted-foreground text-sm">{t("billing.contactSales")}</span>
      ) : (
        <>
          {discountPreview ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">
                {formatMoney(discountPreview.discountedPriceMinor, plan.currency, locale)}
              </span>
              <span className="text-muted-foreground text-xs">
                {t(
                  discountPreview.duration === "FOREVER"
                    ? "billing.promoCode.forever"
                    : "billing.promoCode.thenPrice",
                  {
                    price: formatMoney(discountPreview.thenPriceMinor, plan.currency, locale),
                    months: discountPreview.durationInMonths ?? 0,
                  },
                )}
              </span>
            </div>
          ) : (
            <span className="text-lg font-semibold">
              {formatMoney(priceMinor, plan.currency, locale)}
              <span className="text-muted-foreground text-sm font-normal">
                {" / "}
                {t(interval === "ANNUAL" ? "billing.perYear" : "billing.perMonth")}
              </span>
            </span>
          )}
        </>
      )}

      <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        <li>
          {plan.limits.maxUsers === null
            ? t("billing.usage.unlimitedUsers")
            : t("billing.limits.users", { count: plan.limits.maxUsers })}
        </li>
        <li>
          {plan.limits.maxActiveAssets === null
            ? t("billing.usage.unlimitedAssets")
            : t("billing.limits.assets", { count: plan.limits.maxActiveAssets })}
        </li>
      </ul>

      {!plan.isContactSalesOnly && (
        <Button
          size="sm"
          className="mt-2"
          disabled={isCurrent || isPending || !stripeConfigured}
          onClick={onSubscribe}
          title={!stripeConfigured ? t("billing.stripeNotConfigured") : undefined}
        >
          {isCurrent
            ? t("billing.actions.currentPlan")
            : isPending
              ? t("common.saving")
              : t("billing.actions.choose")}
        </Button>
      )}
    </div>
  );
}
