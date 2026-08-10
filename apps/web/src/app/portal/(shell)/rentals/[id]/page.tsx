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
} from "@rentos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreatePortalDamageReport,
  useUploadPortalDamageReportPhoto,
} from "../../../../../hooks/use-portal-damage-reports";
import { usePortalDocuments } from "../../../../../hooks/use-portal-documents";
import {
  useCreatePortalExtensionRequest,
  usePortalExtensionRequests,
} from "../../../../../hooks/use-portal-extension-requests";
import { usePortalDamageReports } from "../../../../../hooks/use-portal-damage-reports";
import {
  portalRentalDocumentsZipUrl,
  portalRentalQrCodeUrl,
  usePortalRental,
  usePortalRentalTimeline,
} from "../../../../../hooks/use-portal-rentals";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import { formatDate, formatDateTime } from "../../../../../lib/date-format";
import { formatMoney } from "../../../../../lib/money";

export default function PortalRentalDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();

  const { data: rental, isLoading, isError } = usePortalRental(params.id);
  const { data: timeline } = usePortalRentalTimeline(params.id);
  const { data: documents } = usePortalDocuments({ rentalId: params.id, pageSize: 50 });
  const { data: extensionRequests } = usePortalExtensionRequests(params.id);
  const { data: damageReports } = usePortalDamageReports(params.id);

  const [showQrCode, setShowQrCode] = useState(false);
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [showDamageForm, setShowDamageForm] = useState(false);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !rental) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  const canRequestExtension = rental.status === "RESERVED" || rental.status === "ACTIVE";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("portal.rentals.detailTitle", { number: rental.rentalNumber })}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(`portal.rentals.statuses.${rental.status}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRequestExtension && (
            <Button size="sm" variant="outline" onClick={() => setShowExtensionForm((v) => !v)}>
              {t("portal.rentals.requestExtension")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowDamageForm((v) => !v)}>
            {t("portal.rentals.reportDamage")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowQrCode((v) => !v)}>
            {t("portal.rentals.showQrCode")}
          </Button>
          {documents && documents.items.length > 0 && (
            <Button asChild size="sm">
              <a href={portalRentalDocumentsZipUrl(rental.id)}>
                {t("portal.rentals.downloadAllDocuments")}
              </a>
            </Button>
          )}
        </div>
      </div>

      {showQrCode && (
        <Card className="w-fit">
          <CardContent className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- direct API-served image, not a Next-optimizable asset */}
            <img
              src={portalRentalQrCodeUrl(rental.id)}
              alt={rental.rentalNumber}
              width={200}
              height={200}
            />
          </CardContent>
        </Card>
      )}

      {showExtensionForm && (
        <ExtensionRequestForm
          rentalId={rental.id}
          currentEnd={rental.plannedEnd}
          onDone={() => setShowExtensionForm(false)}
        />
      )}

      {showDamageForm && (
        <DamageReportForm rentalId={rental.id} onDone={() => setShowDamageForm(false)} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("portal.rentals.period")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.plannedStart")}
                value={formatDateTime(rental.plannedStart, i18n.language)}
              />
              <InfoRow
                label={t("rental.fields.plannedEnd")}
                value={formatDateTime(rental.plannedEnd, i18n.language)}
              />
              <InfoRow
                label={t("rental.fields.actualStart")}
                value={rental.actualStart ? formatDateTime(rental.actualStart, i18n.language) : "—"}
              />
              <InfoRow
                label={t("rental.fields.actualEnd")}
                value={rental.actualEnd ? formatDateTime(rental.actualEnd, i18n.language) : "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("portal.rentals.items")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("asset.fields.name")}</th>
                    <th className="p-3 font-medium">{t("portal.rentals.quantity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rental.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-3">
                        <Link
                          href={`/portal/assets/${item.assetId}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.asset.name}
                        </Link>
                      </td>
                      <td className="p-3">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.financial")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.subtotal")}
                value={formatMoney(rental.subtotalMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.discount")}
                value={formatMoney(rental.discountMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.tax")}
                value={formatMoney(rental.taxMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.total")}
                value={formatMoney(rental.totalMinor, rental.currency)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("portal.rentals.documents")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(!documents || documents.items.length === 0) && (
                <p className="text-muted-foreground p-6 text-sm">
                  {t("portal.documents.noDocuments")}
                </p>
              )}
              {documents && documents.items.length > 0 && (
                <ul className="divide-y">
                  {documents.items.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between p-3 text-sm">
                      <span>{doc.title ?? doc.documentNumber}</span>
                      <Link
                        href={`/portal/documents/${doc.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {t("portal.documents.preview")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {(extensionRequests?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("portal.rentals.extensionRequests")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {extensionRequests?.map((request) => (
                  <div key={request.id} className="border-l-2 pl-3">
                    <p className="font-medium">
                      {t(`portal.extensionRequests.statuses.${request.status}`)} —{" "}
                      {formatDate(request.requestedEnd, i18n.language)}
                    </p>
                    {request.responseMessage && (
                      <p className="text-muted-foreground text-xs">{request.responseMessage}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(damageReports?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("portal.rentals.damageReports")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {damageReports?.map((report) => (
                  <div key={report.id} className="border-l-2 pl-3">
                    <p className="font-medium">
                      {t(`portal.damageReports.statuses.${report.status}`)}
                    </p>
                    <p className="text-muted-foreground text-xs">{report.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("portal.rentals.timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {timeline?.map((event) => (
                <li key={event.id} className="border-l-2 pl-3">
                  <p className="font-medium">{t(`rental.timeline.${event.type}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(event.occurredAt, i18n.language)}
                  </p>
                </li>
              ))}
              {(!timeline || timeline.length === 0) && (
                <p className="text-muted-foreground text-sm">{t("asset.noTimelineEvents")}</p>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ExtensionRequestForm({
  rentalId,
  currentEnd,
  onDone,
}: {
  rentalId: string;
  currentEnd: string;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [requestedEnd, setRequestedEnd] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createRequest = useCreatePortalExtensionRequest();

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      await createRequest.mutateAsync({ rentalId, requestedEnd, message: message || undefined });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("portal.extensionRequests.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentEnd">{t("portal.extensionRequests.currentEnd")}</Label>
          <Input
            id="currentEnd"
            type="text"
            value={formatDate(currentEnd, i18n.language)}
            disabled
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requestedEnd">{t("portal.extensionRequests.newEndDate")}</Label>
          <Input
            id="requestedEnd"
            type="date"
            value={requestedEnd}
            onChange={(event) => setRequestedEnd(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="message">{t("portal.extensionRequests.message")}</Label>
          <Input
            id="message"
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <Button
          onClick={() => void handleSubmit()}
          disabled={!requestedEnd || createRequest.isPending}
          className="w-fit"
        >
          {createRequest.isPending
            ? t("portal.extensionRequests.submitting")
            : t("portal.extensionRequests.submit")}
        </Button>
      </CardContent>
    </Card>
  );
}

function DamageReportForm({ rentalId, onDone }: { rentalId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createReport = useCreatePortalDamageReport();
  const uploadPhoto = useUploadPortalDamageReportPhoto();

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      const report = await createReport.mutateAsync({ rentalId, description });
      if (file) {
        await uploadPhoto.mutateAsync({ reportId: report.id, file });
      }
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("portal.damageReports.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">{t("portal.damageReports.description")}</Label>
          <textarea
            id="description"
            className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            rows={3}
            placeholder={t("portal.damageReports.descriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo">{t("portal.damageReports.photos")}</Label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button
          onClick={() => void handleSubmit()}
          disabled={!description || createReport.isPending || uploadPhoto.isPending}
          className="w-fit"
        >
          {createReport.isPending || uploadPhoto.isPending
            ? t("portal.damageReports.submitting")
            : t("portal.damageReports.submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
