"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import { DocumentStatusBadge } from "../../../../components/documents/document-status-badge";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
import {
  documentPdfUrl,
  useArchiveDocument,
  useCancelDocumentSignature,
  useCreateDocumentShareLink,
  useDeleteDocument,
  useDisableDocumentShareLink,
  useDocument,
  useDocumentEmailDeliveries,
  useDocumentPreview,
  useDocumentShareLinks,
  useDocumentSignatureRequests,
  useDocumentTimeline,
  useDuplicateDocument,
  useMarkDocumentReady,
  useMarkDocumentSent,
  useMarkDocumentViewed,
  useRefreshDocumentSignature,
  useRegenerateDocumentPdf,
  useRejectDocument,
  useRequestDocumentSignature,
  useRetryDocumentEmail,
  useSendDocumentEmail,
  useSignDocument,
  useVoidDocument,
} from "../../../../hooks/use-documents";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatDate, formatDateTime } from "../../../../lib/date-format";
import { DOCUMENT_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";
import type { DocumentEmailRecipientType } from "../../../../types/document";

const DELETABLE_STATUSES = new Set(["DRAFT", "VOIDED"]);
const READY_STATUSES = new Set(["DRAFT"]);
const SENDABLE_STATUSES = new Set(["READY"]);
const VIEWABLE_STATUSES = new Set(["SENT"]);
const SIGNABLE_STATUSES = new Set(["SENT", "VIEWED", "PARTIALLY_SIGNED"]);
const REJECTABLE_STATUSES = new Set(["SENT", "VIEWED"]);
const VOIDABLE_STATUSES = new Set(["DRAFT", "READY", "SENT", "VIEWED", "PARTIALLY_SIGNED"]);
const ARCHIVABLE_STATUSES = new Set(["SIGNED", "REJECTED", "VOIDED"]);

export default function DocumentDetailPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState("");
  const [emailForm, setEmailForm] = useState<{
    recipientType: DocumentEmailRecipientType;
    customEmail: string;
    subject: string;
    message: string;
  }>({ recipientType: "CUSTOMER", customEmail: "", subject: "", message: "" });
  const [signerForm, setSignerForm] = useState({ signerName: "", signerEmail: "" });

  const { data: document, isLoading, isError } = useDocument(tenantId, params.id);
  const { data: timeline } = useDocumentTimeline(tenantId, params.id);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (!document) return;
    trackRecentItem({
      id: `document:${document.id}`,
      kind: "entity",
      entityType: "document",
      label: document.documentNumber,
      href: `/app/documents/${document.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the loaded document changes
  }, [document?.id]);
  const { data: preview } = useDocumentPreview(tenantId, params.id);
  const { data: shareLinks } = useDocumentShareLinks(tenantId, params.id);
  const { data: emailDeliveries } = useDocumentEmailDeliveries(tenantId, params.id);
  const { data: signatureRequests } = useDocumentSignatureRequests(tenantId, params.id);

  const deleteDocument = useDeleteDocument(tenantId);
  const markReady = useMarkDocumentReady(tenantId);
  const markSent = useMarkDocumentSent(tenantId);
  const markViewed = useMarkDocumentViewed(tenantId);
  const signDocument = useSignDocument(tenantId);
  const rejectDocument = useRejectDocument(tenantId);
  const voidDocument = useVoidDocument(tenantId);
  const archiveDocument = useArchiveDocument(tenantId);
  const duplicateDocument = useDuplicateDocument(tenantId);
  const regeneratePdf = useRegenerateDocumentPdf(tenantId);
  const createShareLink = useCreateDocumentShareLink(tenantId);
  const disableShareLink = useDisableDocumentShareLink(tenantId);
  const sendEmail = useSendDocumentEmail(tenantId);
  const retryEmail = useRetryDocumentEmail(tenantId);
  const requestSignature = useRequestDocumentSignature(tenantId);
  const refreshSignature = useRefreshDocumentSignature(tenantId);
  const cancelSignature = useCancelDocumentSignature(tenantId);

  const canUpdate = usePermission("documents.update");
  const canDelete = usePermission("documents.delete");
  const canSend = usePermission("documents.send");
  const canSign = usePermission("documents.sign");
  const canVoid = usePermission("documents.void");
  const canArchive = usePermission("documents.archive");
  const canDownload = usePermission("documents.download");
  const canRender = usePermission("documents.render");
  const canShare = usePermission("documents.share");
  const canCreate = usePermission("documents.create");

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !document) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t("document.deleteConfirm"))) return;
    await runAction(async () => {
      await deleteDocument.mutateAsync(document!.id);
      router.push("/app/documents");
    });
  }

  async function handleDuplicate(): Promise<void> {
    await runAction(async () => {
      const duplicated = await duplicateDocument.mutateAsync({ id: document!.id });
      router.push(`/app/documents/${duplicated.id}`);
    });
  }

  async function handleReject(): Promise<void> {
    const reason = window.prompt(t("document.actions.rejectPrompt")) ?? undefined;
    await runAction(() => rejectDocument.mutateAsync({ id: document!.id, reason }));
  }

  async function handleVoid(): Promise<void> {
    const reason = window.prompt(t("document.actions.voidPrompt")) ?? undefined;
    await runAction(() => voidDocument.mutateAsync({ id: document!.id, reason }));
  }

  async function handleCreateShareLink(): Promise<void> {
    await runAction(async () => {
      const result = await createShareLink.mutateAsync({
        documentId: document!.id,
        password: sharePassword || undefined,
      });
      window.prompt(
        t("share.linkCreatedPrompt"),
        `${window.location.origin}/share/${result.token}`,
      );
      setSharePassword("");
    });
  }

  async function handleSendEmail(): Promise<void> {
    await runAction(() =>
      sendEmail.mutateAsync({
        documentId: document!.id,
        recipientType: emailForm.recipientType,
        customEmail: emailForm.recipientType === "CUSTOM" ? emailForm.customEmail : undefined,
        subject: emailForm.subject,
        message: emailForm.message || undefined,
      }),
    );
  }

  async function handleRequestSignature(): Promise<void> {
    await runAction(() =>
      requestSignature.mutateAsync({
        documentId: document!.id,
        signerName: signerForm.signerName || undefined,
        signerEmail: signerForm.signerEmail || undefined,
      }),
    );
  }

  const currentVersion =
    document.versions.find(
      (v) => v.versionNumber === (selectedVersion ?? document.currentVersionNumber),
    ) ?? document.versions[0];

  const canMarkReady = canUpdate && READY_STATUSES.has(document.status);
  const canMarkSent = canSend && SENDABLE_STATUSES.has(document.status);
  const canMarkSigned = canSign && SIGNABLE_STATUSES.has(document.status);
  const nextAction: "ready" | "sent" | "sign" | null = canMarkReady
    ? "ready"
    : canMarkSent
      ? "sent"
      : canMarkSigned
        ? "sign"
        : null;

  const documentTypeLabel =
    document.documentType === "CUSTOM"
      ? (document.customTypeName ?? t("document.types.CUSTOM"))
      : t(`document.types.${document.documentType}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={document.documentNumber}
        subtitle={documentTypeLabel}
        contextInfo={<DocumentStatusBadge status={document.status} />}
        primaryAction={
          nextAction === "ready" ? (
            <Button
              size="sm"
              onClick={() => void runAction(() => markReady.mutateAsync({ id: document!.id }))}
            >
              {t("document.actions.markReady")}
            </Button>
          ) : nextAction === "sent" ? (
            <Button
              size="sm"
              onClick={() => void runAction(() => markSent.mutateAsync({ id: document!.id }))}
            >
              {t("document.actions.markSent")}
            </Button>
          ) : nextAction === "sign" ? (
            <Button
              size="sm"
              onClick={() =>
                void runAction(() => signDocument.mutateAsync({ id: document!.id, full: true }))
              }
            >
              {t("document.actions.markSigned")}
            </Button>
          ) : undefined
        }
        secondaryActions={
          <div className="flex flex-wrap gap-2">
            <PinButton
              entityType="document"
              entityId={document.id}
              label={document.documentNumber}
              href={`/app/documents/${document.id}`}
            />
            {canDownload && (
              <Button asChild variant="outline" size="sm">
                <a href={documentPdfUrl(tenantId, document.id)} target="_blank" rel="noreferrer">
                  {t("document.actions.viewPdf")}
                </a>
              </Button>
            )}
            {canRender && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction(() => regeneratePdf.mutateAsync(document!.id))}
              >
                {t("document.actions.regeneratePdf")}
              </Button>
            )}
            {canSend && VIEWABLE_STATUSES.has(document.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction(() => markViewed.mutateAsync({ id: document!.id }))}
              >
                {t("document.actions.markViewed")}
              </Button>
            )}
            {canSign &&
              document.status !== "PARTIALLY_SIGNED" &&
              SIGNABLE_STATUSES.has(document.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runAction(() =>
                      signDocument.mutateAsync({ id: document!.id, full: false }),
                    )
                  }
                >
                  {t("document.actions.markPartiallySigned")}
                </Button>
              )}
            {canSign && REJECTABLE_STATUSES.has(document.status) && (
              <Button variant="outline" size="sm" onClick={() => void handleReject()}>
                {t("document.actions.reject")}
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" size="sm" onClick={() => void handleDuplicate()}>
                {t("document.actions.duplicate")}
              </Button>
            )}
            {canVoid && VOIDABLE_STATUSES.has(document.status) && (
              <Button variant="outline" size="sm" onClick={() => void handleVoid()}>
                {t("document.actions.void")}
              </Button>
            )}
            {canArchive && ARCHIVABLE_STATUSES.has(document.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void runAction(() => archiveDocument.mutateAsync({ id: document!.id }))
                }
              >
                {t("document.actions.archive")}
              </Button>
            )}
            {canDelete && DELETABLE_STATUSES.has(document.status) && (
              <Button size="sm" variant="outline" onClick={() => void handleDelete()}>
                {t("customer.delete")}
              </Button>
            )}
          </div>
        }
      />

      {actionError && <p className="text-destructive text-sm">{actionError}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {(document.customer ?? document.rental ?? document.quote ?? document.asset) && (
            <Card>
              <CardHeader>
                <CardTitle>{t("document.sections.relatedEntities")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {document.customer && (
                  <RelatedEntityRow
                    label={t("document.fields.customer")}
                    href={`/app/customers/${document.customer.id}`}
                    value={`${document.customer.firstName} ${document.customer.lastName}`}
                  />
                )}
                {document.rental && (
                  <RelatedEntityRow
                    label={t("document.fields.rental")}
                    href={`/app/rentals/${document.rental.id}`}
                    value={document.rental.rentalNumber}
                  />
                )}
                {document.quote && (
                  <RelatedEntityRow
                    label={t("document.fields.quote")}
                    href={`/app/quotes/${document.quote.id}`}
                    value={document.quote.quoteNumber}
                  />
                )}
                {document.asset && (
                  <RelatedEntityRow
                    label={t("document.fields.asset")}
                    href={`/app/assets/${document.asset.id}`}
                    value={document.asset.name}
                  />
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("document.sections.preview")}</CardTitle>
              {document.versions.length > 1 && (
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={selectedVersion ?? document.currentVersionNumber}
                  onChange={(event) => setSelectedVersion(Number(event.target.value))}
                >
                  {document.versions.map((version) => (
                    <option key={version.id} value={version.versionNumber}>
                      {t("document.fields.version")} {version.versionNumber}
                    </option>
                  ))}
                </select>
              )}
            </CardHeader>
            <CardContent>
              {preview ? (
                <iframe
                  title={t("document.sections.preview")}
                  srcDoc={preview.html}
                  className="h-[600px] w-full rounded-md border bg-white"
                />
              ) : (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              )}
              {currentVersion && (
                <p className="text-muted-foreground mt-2 text-xs">
                  {t("document.fields.createdAt")}:{" "}
                  {formatDateTime(currentVersion.createdAt, i18n.language)}
                  {currentVersion.reason ? ` · ${currentVersion.reason}` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          {canShare && (
            <Card>
              <CardHeader>
                <CardTitle>{t("share.title")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sharePassword">{t("share.fields.password")}</Label>
                    <Input
                      id="sharePassword"
                      type="text"
                      value={sharePassword}
                      onChange={(event) => setSharePassword(event.target.value)}
                      placeholder={t("share.fields.passwordPlaceholder")}
                    />
                  </div>
                  <Button size="sm" onClick={() => void handleCreateShareLink()}>
                    {t("share.actions.create")}
                  </Button>
                </div>
                <ul className="flex flex-col gap-2 text-sm">
                  {shareLinks?.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <span>
                        {link.disabledAt ? t("share.status.disabled") : t("share.status.active")} ·{" "}
                        {t("share.fields.views")}: {link.viewCount} · {t("share.fields.downloads")}:{" "}
                        {link.downloadCount} · {t("share.fields.expiresAt")}:{" "}
                        {formatDate(link.expiresAt, i18n.language)}
                      </span>
                      {!link.disabledAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void runAction(() =>
                              disableShareLink.mutateAsync({
                                documentId: document!.id,
                                shareLinkId: link.id,
                              }),
                            )
                          }
                        >
                          {t("share.actions.disable")}
                        </Button>
                      )}
                    </li>
                  ))}
                  {(!shareLinks || shareLinks.length === 0) && (
                    <p className="text-muted-foreground text-sm">{t("share.noLinks")}</p>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {canSend && (
            <Card>
              <CardHeader>
                <CardTitle>{t("document.sections.email")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recipientType">{t("document.email.recipientType")}</Label>
                    <select
                      id="recipientType"
                      className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                      value={emailForm.recipientType}
                      onChange={(event) =>
                        setEmailForm((prev) => ({
                          ...prev,
                          recipientType: event.target.value as DocumentEmailRecipientType,
                        }))
                      }
                    >
                      <option value="CUSTOMER">
                        {t("document.email.recipientTypes.CUSTOMER")}
                      </option>
                      <option value="EMPLOYEE">
                        {t("document.email.recipientTypes.EMPLOYEE")}
                      </option>
                      <option value="CUSTOM">{t("document.email.recipientTypes.CUSTOM")}</option>
                    </select>
                  </div>
                  {emailForm.recipientType === "CUSTOM" && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="customEmail">{t("document.email.customEmail")}</Label>
                      <Input
                        id="customEmail"
                        type="email"
                        value={emailForm.customEmail}
                        onChange={(event) =>
                          setEmailForm((prev) => ({ ...prev, customEmail: event.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="emailSubject">{t("document.email.subject")}</Label>
                  <Input
                    id="emailSubject"
                    value={emailForm.subject}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="emailMessage">{t("document.email.message")}</Label>
                  <textarea
                    id="emailMessage"
                    className="border-input min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                    value={emailForm.message}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                </div>
                <Button
                  size="sm"
                  className="self-start"
                  disabled={!emailForm.subject}
                  onClick={() => void handleSendEmail()}
                >
                  {t("document.email.send")}
                </Button>
                <ul className="flex flex-col gap-2 text-sm">
                  {emailDeliveries?.map((delivery) => (
                    <li
                      key={delivery.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <span>
                        {delivery.recipientEmail} ·{" "}
                        {t(`document.email.statuses.${delivery.status}`)}
                        {delivery.errorMessage ? ` · ${delivery.errorMessage}` : ""}
                      </span>
                      {delivery.status === "FAILED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void runAction(() =>
                              retryEmail.mutateAsync({
                                documentId: document!.id,
                                emailDeliveryId: delivery.id,
                              }),
                            )
                          }
                        >
                          {t("document.email.retry")}
                        </Button>
                      )}
                    </li>
                  ))}
                  {(!emailDeliveries || emailDeliveries.length === 0) && (
                    <p className="text-muted-foreground text-sm">
                      {t("document.email.noDeliveries")}
                    </p>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {canSign && (
            <Card>
              <CardHeader>
                <CardTitle>{t("document.sections.signature")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signerName">{t("document.signature.signerName")}</Label>
                    <Input
                      id="signerName"
                      value={signerForm.signerName}
                      onChange={(event) =>
                        setSignerForm((prev) => ({ ...prev, signerName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signerEmail">{t("document.signature.signerEmail")}</Label>
                    <Input
                      id="signerEmail"
                      type="email"
                      value={signerForm.signerEmail}
                      onChange={(event) =>
                        setSignerForm((prev) => ({ ...prev, signerEmail: event.target.value }))
                      }
                    />
                  </div>
                  <Button size="sm" onClick={() => void handleRequestSignature()}>
                    {t("document.signature.request")}
                  </Button>
                </div>
                <ul className="flex flex-col gap-2 text-sm">
                  {signatureRequests?.map((request) => (
                    <li
                      key={request.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <span>
                        {request.signerName ?? request.signerEmail ?? t("document.fields.none")} ·{" "}
                        {t(`document.signature.statuses.${request.status}`)} ·{" "}
                        {t(`document.signature.providers.${request.provider}`)}
                      </span>
                      {(request.status === "REQUESTED" || request.status === "PENDING") && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(() =>
                                refreshSignature.mutateAsync({
                                  documentId: document!.id,
                                  signatureRequestId: request.id,
                                }),
                              )
                            }
                          >
                            {t("document.signature.refresh")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(() =>
                                cancelSignature.mutateAsync({
                                  documentId: document!.id,
                                  signatureRequestId: request.id,
                                }),
                              )
                            }
                          >
                            {t("document.signature.cancel")}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                  {(!signatureRequests || signatureRequests.length === 0) && (
                    <p className="text-muted-foreground text-sm">
                      {t("document.signature.noRequests")}
                    </p>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("timeline.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline
              events={timeline}
              registry={DOCUMENT_TIMELINE_REGISTRY}
              isLoading={!timeline}
              emptyLabel={t("timeline.empty")}
              searchPlaceholder={t("timeline.searchPlaceholder")}
            />
          </CardContent>
        </Card>
      </div>

      <Link href="/app/documents" className="text-muted-foreground text-sm underline">
        {t("document.backToList")}
      </Link>
    </div>
  );
}

function RelatedEntityRow({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Link href={href} className="text-primary hover:underline">
        {value}
      </Link>
    </div>
  );
}
