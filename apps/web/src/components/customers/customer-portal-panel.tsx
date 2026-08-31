"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  staffDamageReportPhotoUrl,
  useConvertDamageReportToDocument,
  useInviteCustomerToPortal,
  usePortalAccessStatus,
  useRespondToExtensionRequest,
  useReviewDamageReport,
  useRevokeCustomerPortalAccess,
  useSendStaffPortalMessage,
  useStaffDamageReports,
  useStaffExtensionRequests,
  useStaffPortalMessages,
} from "../../hooks/use-customer-portal";
import { usePermission, useTenantTimezone } from "../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import { formatDateTime } from "../../lib/date-format";

export function CustomerPortalPanel({
  tenantId,
  customerId,
}: {
  tenantId: string;
  customerId: string;
}) {
  const canManage = usePermission("customers.portal.manage");

  if (!canManage) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PortalAccessCard tenantId={tenantId} customerId={customerId} />
      <PortalExtensionRequestsCard tenantId={tenantId} customerId={customerId} />
      <PortalDamageReportsCard tenantId={tenantId} customerId={customerId} />
      <PortalMessagesCard tenantId={tenantId} customerId={customerId} />
    </div>
  );
}

function PortalAccessCard({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const { data: status, isLoading } = usePortalAccessStatus(tenantId, customerId);
  const invite = useInviteCustomerToPortal(tenantId);
  const revoke = useRevokeCustomerPortalAccess(tenantId);

  async function handleInvite(): Promise<void> {
    setError(null);
    try {
      const result = await invite.mutateAsync({ customerId });
      setInviteLink(result.inviteLink);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!window.confirm(t("customer.portal.revokeConfirm"))) return;
    setError(null);
    try {
      await revoke.mutateAsync(customerId);
      setInviteLink(null);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("customer.portal.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {inviteLink && (
          <div className="bg-muted rounded-md p-3 text-xs break-all">
            {t("customer.portal.inviteLinkCreated")}
            <br />
            {inviteLink}
          </div>
        )}
        {status && (
          <>
            <p>
              {status.activated
                ? t("customer.portal.activated")
                : status.invited
                  ? status.invitationExpired
                    ? t("customer.portal.invitationExpired")
                    : t("customer.portal.invited")
                  : t("customer.portal.notInvited")}
            </p>
            {status.lastLoginAt && (
              <p className="text-muted-foreground text-xs">
                {t("customer.portal.lastLogin")}:{" "}
                {formatDateTime(status.lastLoginAt, i18n.language)}
              </p>
            )}
            <div className="flex gap-2">
              {!status.activated && (
                <Button size="sm" onClick={() => void handleInvite()} disabled={invite.isPending}>
                  {status.invited ? t("customer.portal.reinvite") : t("customer.portal.invite")}
                </Button>
              )}
              {(status.invited || status.activated) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRevoke()}
                  disabled={revoke.isPending}
                >
                  {t("customer.portal.revoke")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PortalExtensionRequestsCard({
  tenantId,
  customerId,
}: {
  tenantId: string;
  customerId: string;
}) {
  const { t, i18n } = useTranslation();
  const timeZone = useTenantTimezone();
  const { data: allRequests } = useStaffExtensionRequests(tenantId);
  const respond = useRespondToExtensionRequest(tenantId);
  const requests = allRequests?.filter((request) => request.customerId === customerId) ?? [];

  async function handleRespond(id: string, approve: boolean): Promise<void> {
    const responseMessage =
      window.prompt(t("customer.portal.responseMessagePlaceholder")) ?? undefined;
    await respond.mutateAsync({ id, approve, responseMessage });
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("customer.portal.extensionRequests")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {requests.map((request) => (
          <div
            key={request.id}
            className="flex items-center justify-between border-b pb-2 last:border-0"
          >
            <div>
              <p>{t(`portal.extensionRequests.statuses.${request.status}`)}</p>
              <p className="text-muted-foreground text-xs">
                → {formatDateTime(request.requestedEnd, i18n.language, timeZone)}
                {request.message ? ` · ${request.message}` : ""}
              </p>
            </div>
            {request.status === "PENDING" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleRespond(request.id, true)}>
                  {t("customer.portal.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRespond(request.id, false)}
                >
                  {t("customer.portal.reject")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PortalDamageReportsCard({
  tenantId,
  customerId,
}: {
  tenantId: string;
  customerId: string;
}) {
  const { t } = useTranslation();
  const { data: allReports } = useStaffDamageReports(tenantId);
  const review = useReviewDamageReport(tenantId);
  const convert = useConvertDamageReportToDocument(tenantId);
  const reports = allReports?.filter((report) => report.customerId === customerId) ?? [];

  if (reports.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("customer.portal.damageReports")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {reports.map((report) => (
          <div key={report.id} className="flex flex-col gap-2 border-b pb-3 last:border-0">
            <p>{report.description}</p>
            <p className="text-muted-foreground text-xs">
              {t(`portal.damageReports.statuses.${report.status}`)}
            </p>
            {report.photos.length > 0 && (
              <div className="flex gap-2">
                {report.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element -- direct API-served image
                  <img
                    key={photo.id}
                    src={staffDamageReportPhotoUrl(tenantId, report.id, photo.id)}
                    alt=""
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                ))}
              </div>
            )}
            {report.status === "SUBMITTED" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void review.mutateAsync({ id: report.id, status: "REVIEWED" })}
                >
                  {t("customer.portal.markReviewed")}
                </Button>
              </div>
            )}
            {(report.status === "SUBMITTED" || report.status === "REVIEWED") && (
              <div className="flex gap-2">
                {report.status === "REVIEWED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void review.mutateAsync({ id: report.id, status: "RESOLVED" })}
                  >
                    {t("customer.portal.markResolved")}
                  </Button>
                )}
                <Button size="sm" onClick={() => void convert.mutateAsync(report.id)}>
                  {t("customer.portal.convertToDocument")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PortalMessagesCard({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState("");
  const { data: messages } = useStaffPortalMessages(tenantId, customerId);
  const sendMessage = useSendStaffPortalMessage(tenantId);

  async function handleSend(): Promise<void> {
    if (!body.trim()) return;
    await sendMessage.mutateAsync({ customerId, body });
    setBody("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("customer.portal.messages")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {(!messages || messages.length === 0) && (
          <p className="text-muted-foreground text-sm">{t("customer.portal.noMessages")}</p>
        )}
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {messages?.map((message) => (
            <div
              key={message.id}
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                message.senderType === "STAFF"
                  ? "bg-primary text-primary-foreground self-end"
                  : "bg-secondary text-secondary-foreground self-start"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {formatDateTime(message.createdAt, i18n.language)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="border-input h-9 flex-1 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            placeholder={t("customer.portal.messagePlaceholder")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={!body.trim() || sendMessage.isPending}
          >
            {t("customer.portal.sendMessage")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
