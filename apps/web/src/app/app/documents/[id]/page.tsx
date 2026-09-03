"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SignaturePad,
} from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import { DocumentAttachments } from "../../../../components/documents/document-attachments";
import { DocumentStatusBadge } from "../../../../components/documents/document-status-badge";
import {
  companySignatureFileUrl,
  useCompanySignature,
} from "../../../../hooks/use-company-signature";
import {
  documentSignatureFileUrl,
  useCaptureDocumentSignature,
  useDocumentSignatures,
} from "../../../../hooks/use-document-signatures";
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
import { usePermission, useTenantTimezone } from "../../../../hooks/use-current-tenant-role";
import { useEntitlementErrorToast } from "../../../../hooks/use-entitlement-error-toast";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatDate, formatDateTime } from "../../../../lib/date-format";
import { emailDeliveryDetailText } from "../../../../lib/email-delivery-status";
import { DOCUMENT_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";
import type {
  DocumentEmailRecipientType,
  DocumentSignatureEvidence,
  DocumentType,
} from "../../../../types/document";

/** Havelio Signature System (docs/PRODUCT_BIBLE.md) — Contract/Handover/Return support company + customer signatures; other document types don't (see Phase 12 of the signature system task). */
const SIGNATURE_ELIGIBLE_TYPES = new Set<DocumentType>([
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
]);

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
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
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
  const showEntitlementError = useEntitlementErrorToast();

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
      showEntitlementError(error);
    }
  }

  /**
   * Prints the already-rendered preview iframe directly -- no manual
   * "Generate PDF, download, open, print" round-trip. The iframe holds a
   * complete, isolated HTML document (its own <html>/<head>/<style>, see
   * DocumentRendererService), so printing it never includes any of this
   * page's own sidebar/nav/buttons: there is nothing else in that
   * document to print. Uses the exact same @page A4 print CSS and
   * localized rendering as the generated PDF (see DECISIONS.md, direct
   * print fix).
   */
  function handlePrint(): void {
    previewFrameRef.current?.contentWindow?.print();
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
              <div className="flex items-center gap-2">
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
                {preview && (
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    {t("document.print")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {preview ? (
                <iframe
                  ref={previewFrameRef}
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

          <Card>
            <CardHeader>
              <CardTitle>{t("document.attachments.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentAttachments
                tenantId={tenantId}
                documentId={document.id}
                documentType={document.documentType}
                files={currentVersion?.files ?? []}
                isDraft={document.status === "DRAFT"}
                canManage={canUpdate}
              />
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
                        {emailDeliveryDetailText(t, delivery) &&
                          ` · ${emailDeliveryDetailText(t, delivery)}`}
                      </span>
                      {(delivery.status === "FAILED" || delivery.status === "NOT_CONFIGURED") && (
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

          {SIGNATURE_ELIGIBLE_TYPES.has(document.documentType) && (
            <DocumentSignaturesCard
              tenantId={tenantId}
              documentId={document.id}
              canSign={canSign}
              customerName={
                document.customer
                  ? `${document.customer.firstName} ${document.customer.lastName}`.trim()
                  : ""
              }
            />
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

type SigningStep = null | "chooseCompanyMethod" | "companyDraw" | "customerDraw";

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md) — NOT a qualified
 * electronic signature. Company and customer signatures are two
 * independent, one-shot captures: once evidence exists for a signer type,
 * it is never editable or re-signable from this UI (the backend rejects a
 * second capture for the same signerType — see
 * DocumentSignatureEvidenceService). Capturing the second signature
 * automatically advances the document to SIGNED (both) or leaves it
 * PARTIALLY_SIGNED (one) — see DocumentsService.sign, driven server-side
 * by the capture endpoint itself, never toggled separately here.
 */
function DocumentSignaturesCard({
  tenantId,
  documentId,
  canSign,
  customerName,
}: {
  tenantId: string | null;
  documentId: string;
  canSign: boolean;
  customerName: string;
}) {
  const { t, i18n } = useTranslation();
  const timeZone = useTenantTimezone();
  const { data: evidence } = useDocumentSignatures(tenantId, documentId);
  const { data: companySignatureData } = useCompanySignature(tenantId);
  const capture = useCaptureDocumentSignature(tenantId, documentId);

  const [step, setStep] = useState<SigningStep>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [customerSignerName, setCustomerSignerName] = useState(customerName);
  const [error, setError] = useState<string | null>(null);

  const companyEvidence = evidence?.find((row) => row.signerType === "TENANT_REPRESENTATIVE");
  const customerEvidence = evidence?.find((row) => row.signerType === "CUSTOMER");
  const storedSignature = companySignatureData?.signature ?? null;

  const status: "UNSIGNED" | "COMPANY_ONLY" | "CUSTOMER_ONLY" | "BOTH" =
    companyEvidence && customerEvidence
      ? "BOTH"
      : companyEvidence
        ? "COMPANY_ONLY"
        : customerEvidence
          ? "CUSTOMER_ONLY"
          : "UNSIGNED";

  function openCompanyFlow(): void {
    setError(null);
    setCompanyName(storedSignature?.representativeName ?? "");
    setCompanyTitle(storedSignature?.representativeTitle ?? "");
    setStep(storedSignature ? "chooseCompanyMethod" : "companyDraw");
  }

  function openCustomerFlow(): void {
    setError(null);
    setCustomerSignerName(customerName);
    setStep("customerDraw");
  }

  async function handleUseStoredSignature(): Promise<void> {
    try {
      await capture.mutateAsync({
        signerType: "TENANT_REPRESENTATIVE",
        method: "STORED_SIGNATURE",
        signerName: companyName || (storedSignature?.representativeName ?? ""),
        ...(companyTitle || storedSignature?.representativeTitle
          ? { signerTitle: companyTitle || (storedSignature?.representativeTitle ?? "") }
          : {}),
      });
      setStep(null);
    } catch (err) {
      setError(apiErrorMessage(err, t("document.signatures.saveFailed")));
    }
  }

  async function handleDrawSave(
    signerType: "TENANT_REPRESENTATIVE" | "CUSTOMER",
    file: File,
  ): Promise<void> {
    setError(null);
    const signerName = signerType === "TENANT_REPRESENTATIVE" ? companyName : customerSignerName;
    if (!signerName.trim()) {
      setError(t("document.signatures.signerNameLabel"));
      return;
    }
    try {
      await capture.mutateAsync({
        signerType,
        method: "DRAWN",
        signerName: signerName.trim(),
        ...(signerType === "TENANT_REPRESENTATIVE" && companyTitle
          ? { signerTitle: companyTitle }
          : {}),
        file,
      });
      setStep(null);
    } catch (err) {
      setError(apiErrorMessage(err, t("document.signatures.saveFailed")));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("document.signatures.title")}</CardTitle>
        <span className="text-muted-foreground text-sm">
          {t(`document.signatures.status.${status}`)}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignatureEvidenceSlot
            label={t("document.signatures.companySignature")}
            evidence={companyEvidence}
            tenantId={tenantId}
            documentId={documentId}
            timeZone={timeZone}
            locale={i18n.language}
            action={
              !companyEvidence && canSign ? (
                <Button size="sm" variant="outline" onClick={openCompanyFlow}>
                  {t("document.signatures.signAsCompany")}
                </Button>
              ) : null
            }
          />
          <SignatureEvidenceSlot
            label={t("document.signatures.customerSignature")}
            evidence={customerEvidence}
            tenantId={tenantId}
            documentId={documentId}
            timeZone={timeZone}
            locale={i18n.language}
            action={
              !customerEvidence && canSign ? (
                <Button size="sm" variant="outline" onClick={openCustomerFlow}>
                  {t("document.signatures.customerSigns")}
                </Button>
              ) : null
            }
          />
        </div>

        <p className="text-muted-foreground text-xs">{t("document.signatures.legalNote")}</p>
      </CardContent>

      <Dialog open={step !== null} onOpenChange={(open) => !open && setStep(null)}>
        <DialogContent>
          {step === "chooseCompanyMethod" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("document.signatures.chooseMethod")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API-served preview image */}
                <img
                  src={companySignatureFileUrl(tenantId ?? "")}
                  alt=""
                  className="border-input bg-muted/30 h-20 w-fit max-w-full rounded-md border object-contain p-2"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={capture.isPending}
                    onClick={() => void handleUseStoredSignature()}
                  >
                    {t("document.signatures.useStoredSignature")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={capture.isPending}
                    onClick={() => setStep("companyDraw")}
                  >
                    {t("document.signatures.drawNow")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "companyDraw" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("document.signatures.signAsCompany")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="companySignerName">
                    {t("document.signatures.signerNameLabel")}
                  </Label>
                  <Input
                    id="companySignerName"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="companySignerTitle">
                    {t("document.signatures.signerTitleLabel")}
                  </Label>
                  <Input
                    id="companySignerTitle"
                    value={companyTitle}
                    onChange={(event) => setCompanyTitle(event.target.value)}
                  />
                </div>
                <SignaturePad
                  isSaving={capture.isPending}
                  labels={{
                    clear: t("signaturePad.clear"),
                    undo: t("signaturePad.undo"),
                    save: t("signaturePad.save"),
                    cancel: t("signaturePad.cancel"),
                    emptyHint: t("signaturePad.emptyHint"),
                  }}
                  onCancel={() => setStep(null)}
                  onSave={(file) => void handleDrawSave("TENANT_REPRESENTATIVE", file)}
                />
              </div>
            </>
          )}

          {step === "customerDraw" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("document.signatures.customerSigns")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="customerSignerName">
                    {t("document.signatures.signerNameLabel")}
                  </Label>
                  <Input
                    id="customerSignerName"
                    value={customerSignerName}
                    onChange={(event) => setCustomerSignerName(event.target.value)}
                  />
                </div>
                <SignaturePad
                  isSaving={capture.isPending}
                  labels={{
                    clear: t("signaturePad.clear"),
                    undo: t("signaturePad.undo"),
                    save: t("signaturePad.save"),
                    cancel: t("signaturePad.cancel"),
                    emptyHint: t("signaturePad.emptyHint"),
                  }}
                  onCancel={() => setStep(null)}
                  onSave={(file) => void handleDrawSave("CUSTOMER", file)}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SignatureEvidenceSlot({
  label,
  evidence,
  tenantId,
  documentId,
  timeZone,
  locale,
  action,
}: {
  label: string;
  evidence: DocumentSignatureEvidence | undefined;
  tenantId: string | null;
  documentId: string;
  timeZone: string | undefined;
  locale: string;
  action: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-input flex flex-col gap-2 rounded-md border p-3">
      <span className="text-muted-foreground text-xs font-medium uppercase">{label}</span>
      {evidence ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API-served signature image */}
          <img
            src={documentSignatureFileUrl(tenantId ?? "", documentId, evidence.id)}
            alt=""
            className="h-16 w-fit max-w-full object-contain"
          />
          <span className="text-sm">{evidence.signerName}</span>
          {evidence.signerTitle && (
            <span className="text-muted-foreground text-xs">{evidence.signerTitle}</span>
          )}
          <span className="text-muted-foreground text-xs">
            {t("document.signatures.signedAt")}:{" "}
            {formatDateTime(evidence.capturedAt, locale, timeZone)}
          </span>
        </>
      ) : (
        action
      )}
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
